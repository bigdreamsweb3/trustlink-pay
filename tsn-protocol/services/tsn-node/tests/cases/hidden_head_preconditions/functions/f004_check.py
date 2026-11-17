from unittest.mock import AsyncMock
import base64
from unittest.mock import patch
from server import runtime as server

async def check(self):
    response = {'result': {'context': {'slot': 50}, 'value': [{'owner': server.TCAP_PROGRAM_ID, 'data': [base64.b64encode(data).decode(), 'base64']} for data in self.records]}}
    with patch.object(server, 'solana_rpc', new=AsyncMock(return_value=response)):
        await server._assert_tcap_gpru_credit_program_preconditions(self.transition)
