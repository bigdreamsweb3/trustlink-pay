import httpx
from server import runtime as server
from cases.receiver_lease_renewal.functions.f020_verify import verify as _case_f020_verify
from cases.receiver_lease_renewal.functions.f021_request import request as _case_f021_request
from functools import partial

async def test_receiver_conflict_logs_only_the_error_code(self):
    verify = _case_f020_verify
    request = partial(_case_f021_request, self)
    with self.assertLogs(server.logger, level='ERROR') as logs:
        with self.assertRaises(httpx.HTTPStatusError):
            await self.process(verify, request)
    self.assertIn('LEASE_INVALID', ' '.join(logs.output))
    self.assertNotIn('must-not-appear', ' '.join(logs.output))
