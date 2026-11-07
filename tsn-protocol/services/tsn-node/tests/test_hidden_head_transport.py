"""Cross-language checks of the real DBrix V1 transport without signing or RPC."""
import base64
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import unittest

from fastapi import HTTPException
import server
from app.solana_pubkey import Pubkey
from dbrix_transaction_record import encrypt_transaction_record_v1
from credit_amount import commitment as amount_commitment


class HiddenHeadTransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        def field(label):
            value = int.from_bytes(hashlib.sha256(label.encode()).digest(), "big") % server.BN254_SCALAR_MODULUS
            return value.to_bytes(32, "big").hex()

        def account(label):
            return str(Pubkey(hashlib.sha256(label.encode()).digest()))

        tcap = Pubkey.from_string(server.TCAP_PROGRAM_ID)
        public_inputs = [field(f"offline public input {index}") for index in range(13)]
        commitment_root = Pubkey.find_program_address([b"tcap:commitment-root:v1"], tcap)[0]
        asset_entry = account("offline asset")
        accounting_epoch = str(Pubkey.find_program_address([b"tcap:credit-epoch:v1", bytes(Pubkey.from_string(asset_entry)), bytes(8)],tcap)[0])
        pool = str(Pubkey.find_program_address([b"tcap:sealed-funding:v1", bytes(Pubkey.from_string(asset_entry)), bytes.fromhex(public_inputs[12])],tcap)[0])
        blinding = field("offline amount blinding")
        amount = str(2**64-1)
        amount_hash = format(amount_commitment(2**32-1, int(amount), int(blinding,16), int(public_inputs[4],16)),"064x")
        digest = hashlib.sha256(b"".join((
            b"TSN_GPRU_TCAP_CREDIT_PRIVATE_V2\0", bytes(commitment_root), bytes.fromhex(public_inputs[0]),
            (2**64 - 1).to_bytes(8, "little"), (50).to_bytes(8, "little"), (1000).to_bytes(8, "little"),
            bytes.fromhex(amount_hash), (2**32 - 1).to_bytes(4, "little"),
            bytes.fromhex(public_inputs[4]), bytes.fromhex(public_inputs[12]), bytes(Pubkey.from_string(accounting_epoch)), bytes(Pubkey.from_string(pool)),
        ))).digest()
        authorization = (int.from_bytes(digest, "big") % server.BN254_SCALAR_MODULUS).to_bytes(32, "big").hex()
        cls.operator = account("offline operator")
        cls.authority = account("offline Mother")
        cls.blockhash = account("offline blockhash")
        # Maximum integer widths and non-repeating commitments exercise the
        # full encrypted owner record, rather than a one-character Memo body.
        transition = {
            "commitmentRoot": str(commitment_root),
            "fundingRootAccount": pool, "accountingEpoch": accounting_epoch,
            "tcapConfig": str(Pubkey.find_program_address([b"tcap:global-config:v1"], tcap)[0]),
            "assetEntry": asset_entry, "reserveState": account("offline reserve"),
            "authorizationDigest": digest.hex(),
            "previousTcapRoot": public_inputs[0], "tcapRootSequence": str(2**64 - 1),
            "tokenId": 2**32 - 1, "amountCommitment": amount_hash,
            "nullifier": public_inputs[4], "validAfterSlot": "50", "expiresAtSlot": "1000",
            "proof": {
                "publicInputs": public_inputs,
                # These are serialization fixtures, not valid Groth16 proofs.
                "proofA": "01" * 64, "proofB": "02" * 128, "proofC": "03" * 64,
                "actionKind": 1, "tokenId": 2**32 - 1, "amountCommitment": amount_hash,
                "authorizationCommitment": authorization,
            },
        }
        memo = encrypt_transaction_record_v1(
            record={
                "version": 2, "recordType": "tsn-gpru-balance-action-v2",
                "amountCommitment": amount_hash, "amountBlinding": blinding, "sequence": str(2**64 - 1),
                "previousMemoCommitment": field("offline previous Memo"),
                "actionCommitment": public_inputs[3], "authorizationCommitment": authorization,
                "nullifier": public_inputs[4], "actionKind": 1,
                "tokenId": transition["tokenId"], "amountBaseUnits": amount,
            },
            shared_point=bytes([10]) * 32, record_ephemeral_public_key=bytes([11]) * 32,
            dna=bytes([12]) * 32,
            encrypted_blinding_delta=public_inputs[9],
            delta_ephemeral_public_x=public_inputs[10], delta_ephemeral_public_y=public_inputs[11],
            memo_binding={
                "successorPortfolioRoot": public_inputs[6], "successorBalanceX": public_inputs[7],
                "successorBalanceY": public_inputs[8], "actionCommitment": public_inputs[3],
                "authorizationCommitment": authorization, "nullifier": public_inputs[4],
            },
        )
        transition.update(memo)
        transition.update(dna="0c" * 32, recordEphemeralPublicKey="0b" * 32, actionCommitment=public_inputs[3])
        public_inputs[2] = memo["memoCommitmentField"]
        fixture = {
            "transition": transition, "operator": cls.operator, "authority": cls.authority,
            "blockhash": cls.blockhash, "motherEscrow": str(server.get_mother_escrow_pda()),
            "tipRouteRoot": str(Pubkey.find_program_address(
                [b"tip:route-merkle-root:v1"], Pubkey.from_string(server.TINS_PROGRAM_ID))[0]),
            "gpruVerifier": str(Pubkey.find_program_address(
                [b"gpru:hidden-head-verifier:v1"], Pubkey.from_string(server.GPRU_PROGRAM_ID))[0]),
        }
        cranker = Path(__file__).resolve().parents[2] / "tsn-cranker-op-daemon"
        result = subprocess.run(
            [shutil.which("node") or "node", "--import", "tsx", "tests/settlement-v1-fixture.ts"],
            cwd=cranker, input=json.dumps(fixture), text=True, capture_output=True, timeout=60,
        )
        if result.returncode:
            raise AssertionError(f"Offline DBrix V1 builder failed: {result.stderr}")
        cls.transport = json.loads(result.stdout)
        cls.transition = transition
        cls.message = base64.b64decode(cls.transport["messageBase64"], validate=True)

    def verify(self, message=None, transition=None):
        return server._verify_mother_signed_tcap_settlement_message(
            self.message if message is None else message,
            operator=self.operator, authority=self.authority,
            transition=self.transition if transition is None else transition,
        )

    def test_full_encrypted_record_fits_actual_v1_wire_and_matches_node_size(self):
        self.assertEqual(self.transport["transactionSizeLimit"], 4096)
        self.assertEqual(self.transport["instructionBytes"], 905)
        self.assertEqual(self.transport["signerCount"], 2)
        self.assertEqual(self.transport["accountCount"], 18)
        self.assertGreater(self.transport["wireBytes"], 1232)
        self.assertLessEqual(self.transport["wireBytes"], 4096)
        self.assertEqual(self.transport["wireBytes"], server._tcap_credit_v1_wire_size(self.transition["memoPayload"]))
        server._assert_tcap_credit_transport_capacity(self.transition["memoPayload"])
        print(f"Offline DBrix V1 settlement: {self.transport['wireBytes']}/4096 bytes, "
              f"authorization={self.transport['instructionBytes']}, Memo={self.transport['memoBytes']}")

    def test_current_funded_note_memo_passes_full_credit_digest_validation(self):
        self.assertEqual(server._validate_tcap_credit_digest(copy.deepcopy(self.transition)), self.transition["commitmentRoot"])

    def test_obsolete_or_extra_public_inputs_cannot_enter_credit_runtime(self):
        for count in (8, 9, 12, 14):
            with self.subTest(count=count):
                transition = copy.deepcopy(self.transition)
                transition["proof"]["publicInputs"] = (transition["proof"]["publicInputs"] + ["01" * 32])[:count]
                with self.assertRaisesRegex(ValueError, "exactly thirteen public"):
                    server._validate_tcap_credit_digest(transition)

    def test_full_credit_validation_rejects_memo_field_substitution(self):
        transition = copy.deepcopy(self.transition)
        transition["proof"]["publicInputs"][2] = "04" * 32
        with self.assertRaisesRegex(ValueError, "canonical Memo hash"):
            server._validate_tcap_credit_digest(transition)

    def test_full_credit_validation_binds_funding_root_to_authorization_digest(self):
        transition = copy.deepcopy(self.transition)
        transition["proof"]["publicInputs"][12] = "04" * 32
        with self.assertRaisesRegex(ValueError, "authorization digest"):
            server._validate_tcap_credit_digest(transition)

    def test_real_package_message_passes_mother_verifier(self):
        self.assertEqual(self.verify(), bytes(Pubkey.from_string(self.blockhash)))

    def test_memo_substitution_fails(self):
        message = bytearray(self.message)
        message[-1] = ord("A") if message[-1] != ord("A") else ord("B")
        with self.assertRaisesRegex(HTTPException, "does not exactly match"):
            self.verify(bytes(message))

    def test_proof_substitution_fails(self):
        transition = copy.deepcopy(self.transition)
        transition["proof"]["proofA"] = "04" * 64
        with self.assertRaisesRegex(HTTPException, "does not exactly match"):
            self.verify(transition=transition)

    def test_funding_root_input_substitution_fails(self):
        transition = copy.deepcopy(self.transition)
        transition["proof"]["publicInputs"][12] = "04" * 32
        with self.assertRaisesRegex(HTTPException, "does not exactly match"):
            self.verify(transition=transition)

    def test_extra_writable_account_fails(self):
        message = bytearray(self.message)
        message[3] -= 1
        with self.assertRaisesRegex(HTTPException, "unexpected writable accounts"):
            self.verify(bytes(message))

    def test_legacy_or_v0_message_fails(self):
        for version in (0x02, 0x80):
            with self.subTest(version=version):
                with self.assertRaisesRegex(ValueError, "only Solana v1"):
                    self.verify(bytes([version]) + self.message[1:])

    def test_oversized_actual_message_fails_before_mother_signing(self):
        message = bytearray(self.message)
        extra = 4097 - self.transport["wireBytes"]
        # The second instruction header carries the Memo's u16 data length.
        length_offset = 42 + self.transport["accountCount"] * 32 + 8 + 4 + 2
        length = int.from_bytes(message[length_offset:length_offset + 2], "little")
        message[length_offset:length_offset + 2] = (length + extra).to_bytes(2, "little")
        message.extend(b"A" * extra)
        with self.assertRaisesRegex(HTTPException, "v1 4096-byte limit"):
            self.verify(bytes(message))


if __name__ == "__main__":
    unittest.main()
