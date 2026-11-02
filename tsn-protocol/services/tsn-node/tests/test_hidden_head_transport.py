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


class HiddenHeadTransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        def field(label):
            value = int.from_bytes(hashlib.sha256(label.encode()).digest(), "big") % server.BN254_SCALAR_MODULUS
            return value.to_bytes(32, "big").hex()

        def account(label):
            return str(Pubkey(hashlib.sha256(label.encode()).digest()))

        tcap = Pubkey.from_string(server.TCAP_PROGRAM_ID)
        public_inputs = [field(f"offline public input {index}") for index in range(12)]
        authorization = field("offline authorization")
        cls.operator = account("offline operator")
        cls.authority = account("offline Mother")
        cls.blockhash = account("offline blockhash")
        # Maximum integer widths and non-repeating commitments exercise the
        # full encrypted owner record, rather than a one-character Memo body.
        transition = {
            "commitmentRoot": str(Pubkey.find_program_address([b"tcap:commitment-root:v1"], tcap)[0]),
            "tcapConfig": str(Pubkey.find_program_address([b"tcap:global-config:v1"], tcap)[0]),
            "assetEntry": account("offline asset"), "reserveState": account("offline reserve"),
            "authorizationDigest": field("offline authorization digest"),
            "previousTcapRoot": public_inputs[0], "tcapRootSequence": str(2**64 - 1),
            "tokenId": 2**32 - 1, "amountBaseUnits": str(2**64 - 1),
            "nullifier": public_inputs[4], "validAfterSlot": "50", "expiresAtSlot": "1000",
            "proof": {
                "publicInputs": public_inputs,
                # These are serialization fixtures, not valid Groth16 proofs.
                "proofA": "01" * 64, "proofB": "02" * 128, "proofC": "03" * 64,
                "actionKind": 1, "tokenId": 2**32 - 1, "amount": str(2**64 - 1),
                "authorizationCommitment": authorization,
            },
        }
        memo = encrypt_transaction_record_v1(
            record={
                "version": 1, "recordType": "tsn-gpru-balance-action-v1", "sequence": str(2**64 - 1),
                "previousMemoCommitment": field("offline previous Memo"),
                "actionCommitment": public_inputs[3], "authorizationCommitment": authorization,
                "nullifier": public_inputs[4], "actionKind": 1,
                "tokenId": transition["tokenId"], "amountBaseUnits": transition["amountBaseUnits"],
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
            cwd=cranker, input=json.dumps(fixture), text=True, capture_output=True, timeout=30,
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
        self.assertEqual(self.transport["instructionBytes"], 825)
        self.assertEqual(self.transport["signerCount"], 2)
        self.assertEqual(self.transport["accountCount"], 15)
        self.assertGreater(self.transport["wireBytes"], 1232)
        self.assertLessEqual(self.transport["wireBytes"], 4096)
        self.assertEqual(self.transport["wireBytes"], server._tcap_credit_v1_wire_size(self.transition["memoPayload"]))
        server._assert_tcap_credit_transport_capacity(self.transition["memoPayload"])
        print(f"Offline DBrix V1 settlement: {self.transport['wireBytes']}/4096 bytes, "
              f"authorization={self.transport['instructionBytes']}, Memo={self.transport['memoBytes']}")

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
