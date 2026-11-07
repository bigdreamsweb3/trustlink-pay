"""Exact signed-wire simulation across unavailable or lagging RPC banks."""
import base64
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException
import server


class DepositRpcTests(unittest.IsolatedAsyncioTestCase):
    async def simulate(self, outcomes):
        seen = []
        async def handle(request):
            import json
            seen.append(json.loads(request.content))
            outcome = outcomes[len(seen) - 1]
            if isinstance(outcome, Exception):
                raise outcome
            return httpx.Response(200, json=outcome)
        real_client = httpx.AsyncClient
        def client(**kwargs):
            return real_client(transport=httpx.MockTransport(handle), **kwargs)
        with patch.object(server, "TSN_SOLANA_RPC_URLS", ["https://one.test", "https://two.test"]), \
             patch.object(server.httpx, "AsyncClient", client):
            result = await server._simulate_owner_signed_tcap_deposit(base64.b64encode(b"synthetic-wire").decode())
        for payload in seen:
            self.assertTrue(payload["params"][1]["sigVerify"])
            self.assertFalse(payload["params"][1]["replaceRecentBlockhash"])
        self.assertEqual(seen[0], seen[-1])
        return result

    async def test_lagging_bank_can_fall_through_to_valid_simulation(self):
        result = await self.simulate([{"result": {"value": {"err": "BlockhashNotFound"}}},
                                     {"result": {"value": {"err": None, "units": 42}}}])
        self.assertEqual(result["programSimulation"], "PASSED")

    async def test_all_banks_explicitly_reject_hash_requires_new_signature(self):
        with self.assertRaisesRegex(ValueError, "prepare and sign a fresh"):
            await self.simulate([{"result": {"value": {"err": "BlockhashNotFound"}}}] * 2)

    async def test_mixed_invalid_and_unknown_is_retryable_in_either_order(self):
        rejected = {"result": {"value": {"err": "BlockhashNotFound"}}}
        for unknown in (httpx.ReadTimeout("synthetic-timeout"), {"error": {"code": -32005}}, {}, None, {"result": {"value": {}}}):
            for outcomes in ([rejected, unknown], [unknown, rejected]):
                with self.subTest(outcomes=outcomes):
                    with self.assertRaises(HTTPException) as raised:
                        await self.simulate(outcomes)
                    self.assertEqual(raised.exception.status_code, 503)

    async def test_program_rejection_remains_terminal(self):
        with self.assertRaisesRegex(ValueError, "Deployed TCAP program rejected"):
            await self.simulate([{"result": {"value": {"err": {"InstructionError": [0, "Custom"]}}}}])
