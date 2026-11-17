from fastapi import HTTPException
from unittest.mock import patch
from server import runtime as server
from cases.shared_value import SharedValue
from cases.receiver_lease_renewal.functions.f017_verify import verify as _case_f017_verify
from functools import partial

async def test_rpc_outage_retries_same_work_without_terminal_rejection(self):
    attempts = SharedValue(0)
    verify = partial(_case_f017_verify, attempts)
    with patch.object(server, 'RECEIVER_NODE_WORK_TIMEOUT', 4):
        await self.process(verify)
    reports = [entry for entry in self.calls if entry[0] == 'PATCH']
    self.assertEqual(attempts.value, 2)
    self.assertEqual(len(reports), 1)
    self.assertEqual(reports[0][2]['json']['status'], 'VERIFIED')
