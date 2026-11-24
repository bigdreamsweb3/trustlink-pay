"""Consent, root binding and actual encrypted-record preparation checks."""
import copy
import hashlib
import unittest

from nacl.signing import SigningKey
from core import BABYJUB_SUBORDER, SparseTree, balance_point, hex_field, poseidon_v1, route_fields
from fixtures import make_fixture, refresh_root, sign_approval
from sender import OPENING_TAG, opening_message, prepare_sender_tin_debit

PUBLIC_KEYS = (
    "ba8a18d20e08228557eea87e11f6d0acb84055465f3a3855bad82d88d1c8a36f",
    "845bfce18051d6bacd1f2faea6e6369dfaee244c03a2819c565156f5803a4b22",
)


def fixture(**options):
    fixture = make_fixture(**options)
    args = fixture["args"]
    owners = [fixture["owner"], SigningKey(hashlib.sha256(b"SYNTHETIC RECIPIENT OWNER ONLY").digest())]
    for leg, name in enumerate(("sender_route", "recipient_route")):
        route = args[name]
        old_key = hex_field(route_fields(route)[1])
        route["gpruElgamalPublicKey"] = PUBLIC_KEYS[leg]
        route["gpruElgamalKeyCommitment"] = hashlib.sha256(
            b"TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0\x01" + bytes.fromhex(PUBLIC_KEYS[leg])).hexdigest()
        if old_key in args["state"]["heads"]:
            args["state"]["heads"][hex_field(route_fields(route)[1])] = args["state"]["heads"].pop(old_key)
    leaves = [poseidon_v1(route_fields(args[name])) for name in ("sender_route", "recipient_route")]
    args["tip_snapshot"]["leaves"] = [str(value) for value in leaves]
    args["tip_root"] = hex_field(SparseTree(32, dict(enumerate(leaves))).root)
    refresh_root(args)
    args["approval"] = sign_approval(args, owners[0])
    from core import commitments
    authorization = commitments(**{name: args[name] for name in (
        "sender_route", "recipient_route", "token_id", "amount", "nonce", "amount_blinding",
        "deployment", "valid_after_slot", "expires_at_slot")})["authorizationCommitment"]
    packets = []
    for leg, name in enumerate(("sender_route",)):
        route = args[name]
        head = args["state"]["heads"].get(hex_field(route_fields(route)[1]))
        opening = args["sender_opening"]
        packet = {
            **OPENING_TAG, "leg": leg, "authorizationCommitment": hex_field(authorization),
            "routeKeyCommitment": route["gpruElgamalKeyCommitment"],
            "tokenId": args["token_id"], "sequence": head["sequence"] if head else "0",
            "previousMemoCommitment": head["memoCommitment"] if head else "0" * 64,
            "balance": str(opening["balance"]), "blinding": str(opening["blinding"]),
        }
        packets.append(sign(packet, owners[leg]))
    for name in ("sender_opening", "memo_commitments"):
        del args[name]
    return {"args": args, "sender_opening_packet": packets[0]}, owners


def sign(packet, owner):
    unsigned = {name: value for name, value in packet.items() if name not in ("ownerPublicKey", "signature")}
    return {**unsigned, "ownerPublicKey": bytes(owner.verify_key).hex(),
            "signature": owner.sign(opening_message(unsigned)).signature.hex()}


class SenderTests(unittest.TestCase):
    def test_encrypted_memos_bind_both_successors_without_mutation(self):
        request, _ = fixture()
        original = copy.deepcopy(request)
        result = prepare_sender_tin_debit(**request)
        self.assertEqual(request, original)
        self.assertNotIn("recipient_opening", request["args"])
        self.assertEqual(result["witness"]["newBalances"], [70, 0])
        self.assertEqual(tuple(result["witness"][name][1] for name in ("successorBalanceX", "successorBalanceY")), balance_point(55, 64))
        for leg, memo in enumerate(result["ownerMemos"]):
            self.assertTrue(memo.startswith("TSN_GPRU_TIN_DEBIT_MEMO_V1:"))
            import base64
            binary = base64.urlsafe_b64decode(memo.split(":", 1)[1] + "=")
            self.assertEqual(len(binary), 416)
            self.assertEqual(binary[:2], bytes([1, leg]))
            for offset, field in ((130, "encryptedBlindingDeltas"), (162, "deltaEphemeralPublicX"), (194, "deltaEphemeralPublicY")):
                self.assertEqual(int.from_bytes(binary[offset:offset + 32], "big"), result["public"][field][leg])
            digest = int.from_bytes(hashlib.sha256(memo.encode("ascii")).digest(), "big")
            from core import BABYJUB_FIELD
            self.assertEqual(digest % BABYJUB_FIELD, result["public"]["memoCommitments"][leg])
            self.assertNotIn("amountBaseUnits", memo)
        self.assertNotEqual(result["public"]["memoCommitments"][0], result["public"]["memoCommitments"][1])

    def test_only_sender_pin_and_signature_are_required(self):
        for attack in ("wrong-sender-pin", "tampered-signature", "recipient-leg", "attacker-owner"):
            request, owners = fixture()
            if attack == "wrong-sender-pin":
                request["args"]["sender_owner_commitment"] = hashlib.sha256(bytes(owners[1].verify_key)).hexdigest()
            elif attack == "tampered-signature":
                request["sender_opening_packet"]["signature"] = "00" * 64
            elif attack == "recipient-leg":
                request["sender_opening_packet"]["leg"] = 1
            else:
                request["sender_opening_packet"] = sign(request["sender_opening_packet"], owners[1])
            with self.subTest(attack=attack), self.assertRaises(ValueError):
                prepare_sender_tin_debit(**request)

    def test_valid_signature_cannot_substitute_context_or_opening(self):
        for field, replacement in (("authorizationCommitment", hex_field(13)),
                                   ("routeKeyCommitment", "11" * 32), ("tokenId", 7),
                                   ("sequence", "4"), ("previousMemoCommitment", hex_field(15)),
                                   ("balance", "101"), ("blinding", "18")):
            request, owners = fixture()
            packet = request["sender_opening_packet"]
            packet[field] = replacement
            request["sender_opening_packet"] = sign(packet, owners[0])
            with self.subTest(field=field), self.assertRaises(ValueError):
                prepare_sender_tin_debit(**request)

    def test_exact_packet_encodings_and_ranges(self):
        for field, replacement in (("balance", "025"), ("balance", "25\n"), ("balance", "-1"),
                                   ("blinding", str(BABYJUB_SUBORDER)), ("sequence", 12),
                                   ("routeKeyCommitment", "ab" * 32 + "\n"), ("tokenId", True),
                                   ("leg", True), ("version", True)):
            request, _ = fixture()
            packet = request["sender_opening_packet"]
            packet[field] = replacement
            with self.subTest(field=field), self.assertRaises(ValueError):
                prepare_sender_tin_debit(**request)

    def test_missing_consent_unsigned_inputs_and_wrong_record_key_reject(self):
        for attack in ("missing-sender", "unsigned-opening", "supplied-memo", "wrong-public-key", "recipient-opening"):
            request, _ = fixture()
            if attack == "missing-sender":
                request["sender_opening_packet"] = None
            elif attack == "unsigned-opening":
                request["args"]["recipient_opening"] = {"balance": 25, "blinding": 23}
            elif attack == "supplied-memo":
                request["args"]["memo_commitments"] = [hex_field(1), hex_field(2)]
            elif attack == "wrong-public-key":
                request["args"]["recipient_route"]["gpruElgamalPublicKey"] = PUBLIC_KEYS[0]
            else:
                request["args"]["recipient_opening"] = {"balance": 25, "blinding": 23}
            with self.subTest(attack=attack), self.assertRaises(ValueError):
                prepare_sender_tin_debit(**request)

    def test_rebase_preserves_exact_sender_head_and_nullifier(self):
        request, _ = fixture()
        before = prepare_sender_tin_debit(**request)
        request["args"]["root_sequence"] += 1
        rebased = prepare_sender_tin_debit(**request)
        self.assertEqual(before["public"]["nullifier"], rebased["public"]["nullifier"])
        self.assertEqual(before["public"]["authorizationCommitment"], rebased["public"]["authorizationCommitment"])
        self.assertEqual(rebased["public"]["rootSequence"], before["public"]["rootSequence"] + 1)
        request["args"]["state"]["heads"][hex_field(route_fields(request["args"]["sender_route"])[1])]["sequence"] = "99"
        refresh_root(request["args"])
        with self.assertRaises(ValueError):
            prepare_sender_tin_debit(**request)

    def test_first_recipient_full_spend_and_blinding_carry(self):
        for options in ({"recipient_exists": False}, {"amount": 100},
                        {"sender_blinding": BABYJUB_SUBORDER - 2, "recipient_blinding": BABYJUB_SUBORDER - 3}):
            request, _ = fixture(**options)
            result = prepare_sender_tin_debit(**request)
            self.assertEqual(len(result["ownerMemos"]), 2)
            if not options.get("recipient_exists", True):
                self.assertEqual(result["witness"]["sequences"][1], 0)
            if options.get("amount") == 100:
                self.assertEqual(result["witness"]["newBalances"][0], 0)
            if "sender_blinding" in options:
                self.assertEqual(result["witness"]["blindingCarries"], [1, 0])


if __name__ == "__main__":
    unittest.main()
