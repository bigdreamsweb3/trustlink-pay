import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException

import server
from pydantic import ValidationError


class FundingIngressPrivacyTests(unittest.IsolatedAsyncioTestCase):
    def test_worker_validation_reason_omits_input_before_logging_or_attestation(self):
        with self.assertRaises(ValidationError) as raised:
            server.CreateIntentRequest(fundingNote={"version": 1, "secret": "01" * 32, "blinding": "02" * 32, "commitment": "03" * 32})
        self.assertEqual(server._verification_rejection_reason(raised.exception), "Invalid Receiver payment request fields")
        self.assertEqual(server._verification_rejection_reason(ValueError(server.FUNDING_ROOT_CHANGED)), server.FUNDING_ROOT_CHANGED)

    async def test_missing_public_field_cannot_echo_private_funding_opening(self):
        opening = {"version": 1, "secret": "01" * 32, "blinding": "02" * 32, "commitment": "03" * 32}
        # Missing required top-level fields triggered Pydantic's full-input echo.
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://offline") as client:
            response = await client.post("/intents", json={"fundingNote": opening})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json(), {"detail": "Invalid payment request fields"})
        for value in opening.values():
            if isinstance(value, str):
                self.assertNotIn(value, response.text)

    async def test_stale_funding_root_returns_retryable_marker_but_bad_layout_does_not(self):
        with patch.object(server, "_assert_tcap_gpru_credit_program_preconditions", new=AsyncMock(side_effect=ValueError(server.FUNDING_ROOT_CHANGED))):
            with self.assertRaises(HTTPException) as raised:
                await server._assert_authorized_credit_preconditions({})
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail, server.FUNDING_ROOT_CHANGED)
        with patch.object(server, "_assert_tcap_gpru_credit_program_preconditions", new=AsyncMock(side_effect=ValueError("Invalid funding layout"))):
            with self.assertRaisesRegex(ValueError, "Invalid funding layout"):
                await server._assert_authorized_credit_preconditions({})


if __name__ == "__main__":
    unittest.main()
