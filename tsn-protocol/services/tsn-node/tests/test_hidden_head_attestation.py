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
        self.transition = {"proof": {"publicInputs": ["01" * 32] * 13}, "fundingRootAccount": "mock-funding-root", "memoPayload": "mock memo", "memoBodyPayload": "mock body"}
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
        self.assertEqual(server._tcap_credit_v1_wire_size(memo), 2157)
        server._assert_tcap_credit_transport_capacity(memo)

    def test_v1_capacity_includes_accounts_config_headers_and_signatures(self):
        memo = "A" * (4096 - 1684)
        self.assertEqual(server._tcap_credit_v1_wire_size(memo), 4096)
        server._assert_tcap_credit_transport_capacity(memo)
        with self.assertRaisesRegex(ValueError, "v1 transaction is 4097 bytes"):
            server._assert_tcap_credit_transport_capacity(memo + "A")

    def test_funding_root_substitution_breaks_execution_attestation(self):
        with self.assertRaisesRegex(HTTPException, "Node-attested execution payload"):
            server._assert_stored_settlement_attestation(self.work, {**self.transition, "fundingRootAccount": "another-root"})

    def test_public_projection_removes_funding_opening_and_nested_witness(self):
        private = copy.deepcopy(self.transition)
        private["fundingNote"] = {"secret": "private", "blinding": "private", "commitment": "private"}
        private["fundingSiblings"] = ["private"]
        private["proof"]["fundingSecret"] = "private"
        self.assertEqual(server._public_tcap_transition(private), self.transition)


if __name__ == "__main__":
    unittest.main()

class CoordinationProjectionTests(unittest.TestCase):
    def test_nested_private_openings_never_enter_execution_projection(self):
        for kind,value in [("TCAP_FUNDING_POOL",{"assetEntry":"asset","root":"root","sourceWalletCount":2}),
                           ("TCAP_EPOCH_ACCOUNTING",{"assetEntry":"asset","total":"100","proof":{"publicInputs":["1"],"proofA":"a","proofB":"b","proofC":"c"}})]:
            private={**value,"amounts":[50,50],"sourceWallets":["private"],"blindings":["secret"]}
            if "proof" in private:private["proof"]={**private["proof"],"openings":["secret"]}
            self.assertEqual(server._public_coordination(kind,private),value)
