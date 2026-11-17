import asyncio
from cases.receiver_lease_renewal.functions.f008_verify import verify as _case_f008_verify
from functools import partial

# No heartbeat after completion.
async def test_long_verification_renews_same_generation_and_reports_once(self):
    verify = partial(_case_f008_verify, self)
    await self.process(verify)
    renewals = [entry for entry in self.calls if entry[0] == 'PUT']
    self.assertGreaterEqual(len(renewals), 4)
    for _, path, kwargs in renewals:
        self.assertEqual(path, '/api/internal/node/work')
        self.assertEqual(kwargs['json'], {'id': 'mock-settlement', 'owner': 'mock-node', 'expectedVersion': 12, 'leaseId': 'mock-claim', 'leaseVersion': 12})
    reports = [entry for entry in self.calls if entry[0] == 'PATCH']
    self.assertEqual(len(reports), 1)
    self.assertEqual(reports[0][2]['json']['expectedVersion'], 12)
    self.assertEqual(reports[0][2]['json']['status'], 'VERIFIED')
    count = len(self.calls)
    await asyncio.sleep(0.02)
    self.assertEqual(len(self.calls), count)
