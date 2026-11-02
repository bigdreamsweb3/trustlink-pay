import base64
import copy
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from nacl.signing import SigningKey
import server


class HiddenHeadAttestationTests(unittest.TestCase):
    def setUp(self):
        self.key = SigningKey(bytes([42]) * 32)  # Test fixture, no wallet/transaction signing.
        self.key_patch = patch.object(server, "_node_verification_signing_key", return_value=self.key)
        self.key_patch.start()
        self.addCleanup(self.key_patch.stop)
        self.transition = {"proof": {"publicInputs": ["01"] * 12}, "memoPayload": "mock memo", "memoBodyPayload": "mock body"}
        self.work = {"id": "mock-settlement", "kind": "SETTLEMENT", "payloadCommitment": "ab" * 32, "stateVersion": 2, "nodeLease": {"leaseId": "mock-lease", "version": 2}}
        evidence = {"verifiedPayload": {"tcapCreditTransition": self.transition}, "verificationType": "TSN_TCAP_GPRU_HIDDEN_HEAD_V1"}
        attestation = server._sign_node_verification(work=self.work, status="VERIFIED", evidence=evidence, verification_type=evidence["verificationType"])
        self.work["verification"] = {"nodeAttestation": attestation}

    def test_original_transition_passes(self):
        server._assert_stored_settlement_attestation(self.work, self.transition)

    def test_valid_proof_substitution_would_break_execution_attestation(self):
        transition = copy.deepcopy(self.transition)
        transition["proof"]["publicInputs"][5] = "another valid route"
        with self.assertRaisesRegex(HTTPException, "Node-attested execution payload"):
            server._assert_stored_settlement_attestation(self.work, transition)

    def test_memo_body_substitution_breaks_attestation(self):
        with self.assertRaises(HTTPException):
            server._assert_stored_settlement_attestation(self.work, {**self.transition, "memoBodyPayload": "altered"})

    def test_signature_substitution_fails(self):
        self.work["verification"]["nodeAttestation"]["signatureBase64"] = base64.b64encode(bytes(64)).decode()
        with self.assertRaisesRegex(HTTPException, "signature is invalid"):
            server._assert_stored_settlement_attestation(self.work, self.transition)

    def test_minimum_memo_fits_canonical_v1_transport(self):
        memo = "TSN_GPRU_HEAD_V1:" + ":".join(["0" * 64] * 7) + ":A"
        self.assertEqual(len(memo), 473)
        self.assertEqual(server._tcap_credit_v1_wire_size(memo), 1978)
        server._assert_tcap_credit_transport_capacity(memo)

    def test_v1_capacity_includes_accounts_config_headers_and_signatures(self):
        memo = "A" * (4096 - 1505)
        self.assertEqual(server._tcap_credit_v1_wire_size(memo), 4096)
        server._assert_tcap_credit_transport_capacity(memo)
        with self.assertRaisesRegex(ValueError, "v1 transaction is 4097 bytes"):
            server._assert_tcap_credit_transport_capacity(memo + "A")


if __name__ == "__main__":
    unittest.main()
