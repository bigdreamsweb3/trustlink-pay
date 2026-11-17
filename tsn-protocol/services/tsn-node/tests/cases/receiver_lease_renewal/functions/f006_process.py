from unittest.mock import AsyncMock
from unittest.mock import patch
from server import runtime as server

async def process(self, verify, request=None):
    with patch.object(server, 'receiver_request', new=AsyncMock(side_effect=request or self.request)), patch.object(server, '_verify_receiver_work', new=AsyncMock(side_effect=verify)):
        await server._process_receiver_work_with_lease(self.client, self.headers, self.work)
