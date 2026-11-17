from unittest.mock import AsyncMock
from unittest.mock import patch
from server import runtime as server

async def test_unavailable_renewal_endpoint_prevents_proving(self):
    verify = AsyncMock()
    with patch.object(server, 'receiver_request', new=AsyncMock(return_value=self.response(404, {}))), patch.object(server, '_verify_receiver_work', new=verify):
        with self.assertRaisesRegex(RuntimeError, 'LEASE_LOST'):
            await server._process_receiver_work_with_lease(self.client, self.headers, self.work)
    verify.assert_not_awaited()
