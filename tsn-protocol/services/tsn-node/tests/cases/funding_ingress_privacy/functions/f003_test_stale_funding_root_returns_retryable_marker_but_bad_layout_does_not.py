from unittest.mock import AsyncMock
from fastapi import HTTPException
from unittest.mock import patch
from server import runtime as server

async def test_stale_funding_root_returns_retryable_marker_but_bad_layout_does_not(self):
    with patch.object(server, '_assert_tcap_gpru_credit_program_preconditions', new=AsyncMock(side_effect=ValueError(server.FUNDING_ROOT_CHANGED))):
        with self.assertRaises(HTTPException) as raised:
            await server._assert_authorized_credit_preconditions({})
    self.assertEqual(raised.exception.status_code, 409)
    self.assertEqual(raised.exception.detail, server.FUNDING_ROOT_CHANGED)
    with patch.object(server, '_assert_tcap_gpru_credit_program_preconditions', new=AsyncMock(side_effect=ValueError('Invalid funding layout'))):
        with self.assertRaisesRegex(ValueError, 'Invalid funding layout'):
            await server._assert_authorized_credit_preconditions({})
