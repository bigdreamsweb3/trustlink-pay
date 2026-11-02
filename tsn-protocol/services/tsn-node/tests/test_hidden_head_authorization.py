import copy
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
import server


class HiddenHeadAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.proof = {"publicInputs": ["01" * 32] * 12, "authorizationCommitment": "02" * 32}
        self.transition = {
            "proof": self.proof, "memoPayload": "mock", "nullifier": "mock-nullifier",
            "amountBaseUnits": "100", "tokenId": 7, "assetEntry": "mock-asset",
            "reserveState": "mock-reserve", "tcapConfig": "mock-config",
        }
        expiry = (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat().replace("+00:00", "Z")
        self.work = {
            "id": "mock-settlement", "kind": "SETTLEMENT", "status": "CRANKER_LEASED", "stateVersion": 4,
            "crankerLease": {"owner": "mock-cranker", "leaseId": "mock-lease", "version": 4, "expiresAt": expiry},
            "payload": {"intentId": "mock-funding"},
            "verification": {"verificationType": "TSN_TCAP_GPRU_HIDDEN_HEAD_V1", "verifiedPayload": {"tcapCreditTransition": self.transition}},
        }
        self.funding = {"id": "mock-funding"}
        self.current = copy.deepcopy(self.work)
        self.lookup = AsyncMock(side_effect=lambda work_id: self.funding if work_id == "mock-funding" else self.current)
        context = {"nullifier": "mock-nullifier", "depositAmountBaseUnits": "100", "depositAccounts": {"reserveState": "mock-reserve", "config": "mock-config"}}
        asset = {"tokenId": 7, "assetEntry": "mock-asset"}
        patches = {
            "_receiver_work_by_id": self.lookup,
            "_assert_stored_settlement_attestation": lambda *_: None,
            "_assert_tcap_credit_transport_capacity": lambda *_: None,
            "_settlement_funding_context": AsyncMock(return_value=(None, asset, context)),
            "_validate_tcap_credit_digest": lambda *_: None,
            "_assert_tcap_gpru_credit_program_preconditions": AsyncMock(),
            "_read_gpru_proof_accounts": AsyncMock(return_value=(self.proof["publicInputs"][5], b"mock-verifier", 252)),
            "prove_hidden_head_credit": AsyncMock(return_value=self.proof),
        }
        for name, value in patches.items():
            item = patch.object(server, name, value)
            item.start()
            self.addCleanup(item.stop)

    async def authorize(self):
        return await server.create_settlement_authorization({"workId": self.work["id"], "crankerPubkey": "mock-cranker"})

    async def test_authorization_matches_receiver_and_cranker_lease_contract(self):
        result = await self.authorize()
        self.assertEqual(result["kind"], "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V2")
        self.assertEqual(result["transition"], self.transition)
        self.assertEqual(result["leaseId"], "mock-lease")
        self.assertEqual(result["leaseVersion"], 4)
        self.assertEqual(result["workStateVersion"], 4)
        self.assertEqual(result["leaseExpiresAt"], self.work["crankerLease"]["expiresAt"])
        expected = int(datetime.fromisoformat(result["leaseExpiresAt"].replace("Z", "+00:00")).timestamp())
        self.assertEqual(result["expiresAtTs"], expected)
        server.prove_hidden_head_credit.assert_awaited_once()
        self.assertEqual(server.prove_hidden_head_credit.call_args.kwargs["existing_proof"], self.proof)

    async def test_lease_rotation_during_verification_is_rejected(self):
        fresh = copy.deepcopy(self.work)
        fresh["stateVersion"] += 1
        fresh["crankerLease"]["leaseId"] = "rotated"
        self.lookup.side_effect = [copy.deepcopy(self.work), self.funding, fresh]
        with self.assertRaisesRegex(HTTPException, "lease changed"):
            await self.authorize()

    async def test_expired_lease_or_unrelated_operator_is_rejected(self):
        for change in ({"owner": "other-cranker"}, {"expiresAt": "2000-01-01T00:00:00Z"}):
            with self.subTest(change=change):
                self.current = copy.deepcopy(self.work)
                self.current["crankerLease"].update(change)
                with self.assertRaises(HTTPException):
                    await self.authorize()


if __name__ == "__main__":
    unittest.main()
