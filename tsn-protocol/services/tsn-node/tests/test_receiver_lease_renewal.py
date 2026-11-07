"""Active verification keeps its claim; lease loss never reports a decision."""
import asyncio
import copy
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException
import server


class ReceiverLeaseRenewalTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.work = {
            "id": "mock-settlement", "kind": "SETTLEMENT", "status": "NODE_VERIFYING",
            "stateVersion": 12, "payloadCommitment": "ab" * 32,
            "nodeLease": {"owner": "mock-node", "leaseId": "mock-claim", "version": 12,
                          "expiresAt": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()},
        }
        self.calls = []
        self.renewals = 0
        self.enough_renewals = asyncio.Event()
        self.cancelled = asyncio.Event()
        self.client = object()
        self.headers = {"x-api-key": "synthetic-test-credential"}
        for name, value in (("TSN_NODE_ID", "mock-node"), ("RECEIVER_NODE_LEASE_RENEW_INTERVAL", 0.005),
                            ("RECEIVER_NODE_WORK_TIMEOUT", 2), ("_sign_node_verification", lambda **_: {"test": True})):
            item = patch.object(server, name, value)
            item.start()
            self.addCleanup(item.stop)

    def response(self, status, body):
        return httpx.Response(status, json=body, request=httpx.Request("POST", "http://receiver.test/api/internal/node/work"))

    async def request(self, client, method, path, **kwargs):
        self.calls.append((method, path, copy.deepcopy(kwargs)))
        if method == "PUT":
            self.renewals += 1
            if self.renewals >= 4:
                self.enough_renewals.set()
            lease = {**self.work["nodeLease"], "expiresAt": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()}
            return self.response(200, {"id": self.work["id"], "stateVersion": 12, "nodeLease": lease})
        return self.response(200, {"status": "VERIFIED"})

    async def never_finishes(self, work):
        try:
            await asyncio.Event().wait()
        finally:
            self.cancelled.set()

    async def process(self, verify, request=None):
        with patch.object(server, "receiver_request", new=AsyncMock(side_effect=request or self.request)), \
             patch.object(server, "_verify_receiver_work", new=AsyncMock(side_effect=verify)):
            await server._process_receiver_work_with_lease(self.client, self.headers, self.work)

    async def test_long_verification_renews_same_generation_and_reports_once(self):
        async def verify(work):
            await self.enough_renewals.wait()
            return {"verifiedPayload": {"tcapCreditTransition": {"tokenId": 1}}, "verificationType": "mock-proof"}
        await self.process(verify)
        renewals = [entry for entry in self.calls if entry[0] == "PUT"]
        self.assertGreaterEqual(len(renewals), 4)
        for _, path, kwargs in renewals:
            self.assertEqual(path, "/api/internal/node/work")
            self.assertEqual(kwargs["json"], {"id": "mock-settlement", "owner": "mock-node", "expectedVersion": 12,
                                             "leaseId": "mock-claim", "leaseVersion": 12})
        reports = [entry for entry in self.calls if entry[0] == "PATCH"]
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0][2]["json"]["expectedVersion"], 12)
        self.assertEqual(reports[0][2]["json"]["status"], "VERIFIED")
        count = len(self.calls)
        await asyncio.sleep(0.02)
        self.assertEqual(len(self.calls), count)  # No heartbeat after completion.

    async def test_lease_loss_cancels_verification_without_rejection_or_report(self):
        async def request(*args, **kwargs):
            response = await self.request(*args, **kwargs)
            return self.response(409, {"error": "LEASE_INVALID"}) if self.renewals > 1 else response
        with self.assertRaisesRegex(RuntimeError, "LEASE_LOST"):
            await self.process(self.never_finishes, request)
        self.assertTrue(self.cancelled.is_set())
        self.assertFalse(any(method == "PATCH" for method, _, _ in self.calls))

    async def test_rotated_claim_or_expired_renewal_cancels_verification(self):
        for mutation in ({"version": 14}, {"expiresAt": "2000-01-01T00:00:00Z"}):
            with self.subTest(mutation=mutation):
                self.renewals = 0
                self.cancelled.clear()
                async def request(*args, **kwargs):
                    response = await self.request(*args, **kwargs)
                    if self.renewals > 1:
                        body = response.json()
                        body["nodeLease"].update(mutation)
                        return self.response(200, body)
                    return response
                with self.assertRaisesRegex(RuntimeError, "LEASE_LOST"):
                    await self.process(self.never_finishes, request)
                self.assertTrue(self.cancelled.is_set())
        self.assertFalse(any(method == "PATCH" for method, _, _ in self.calls))

    async def test_unavailable_renewal_endpoint_prevents_proving(self):
        verify = AsyncMock()
        with patch.object(server, "receiver_request", new=AsyncMock(return_value=self.response(404, {}))), \
             patch.object(server, "_verify_receiver_work", new=verify):
            with self.assertRaisesRegex(RuntimeError, "LEASE_LOST"):
                await server._process_receiver_work_with_lease(self.client, self.headers, self.work)
        verify.assert_not_awaited()

    async def test_verification_failure_is_reported_under_the_active_lease(self):
        async def verify(work):
            raise ValueError("synthetic-invalid-proof")
        await self.process(verify)
        reports = [entry for entry in self.calls if entry[0] == "PATCH"]
        self.assertEqual(reports[0][2]["json"]["status"], "REJECTED")
        self.assertEqual(reports[0][2]["json"]["evidence"]["reason"], "synthetic-invalid-proof")

    async def test_rpc_outage_retries_same_work_without_terminal_rejection(self):
        attempts = 0
        async def verify(work):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise HTTPException(503, "Solana RPC unavailable")
            return {"verifiedPayload": {}, "verificationType": "mock-proof"}
        with patch.object(server, "RECEIVER_NODE_WORK_TIMEOUT", 4):
            await self.process(verify)
        reports = [entry for entry in self.calls if entry[0] == "PATCH"]
        self.assertEqual(attempts, 2)
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0][2]["json"]["status"], "VERIFIED")

    async def test_processing_timeout_cancels_verification_and_renewal(self):
        with patch.object(server, "RECEIVER_NODE_WORK_TIMEOUT", 0.03):
            with self.assertRaisesRegex(TimeoutError, "WORK_TIMEOUT"):
                await self.process(self.never_finishes)
        self.assertTrue(self.cancelled.is_set())
        count = len(self.calls)
        await asyncio.sleep(0.02)
        self.assertEqual(len(self.calls), count)
        self.assertFalse(any(method == "PATCH" for method, _, _ in self.calls))

    async def test_receiver_conflict_logs_only_the_error_code(self):
        async def verify(work):
            return {"verifiedPayload": {}, "verificationType": "mock-proof"}
        async def request(*args, **kwargs):
            response = await self.request(*args, **kwargs)
            return self.response(409, {"error": "LEASE_INVALID", "private": "must-not-appear"}) if args[1] == "PATCH" else response
        with self.assertLogs(server.logger, level="ERROR") as logs:
            with self.assertRaises(httpx.HTTPStatusError):
                await self.process(verify, request)
        self.assertIn("LEASE_INVALID", " ".join(logs.output))
        self.assertNotIn("must-not-appear", " ".join(logs.output))


if __name__ == "__main__":
    unittest.main()
