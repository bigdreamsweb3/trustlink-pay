from cases.receiver_lease_renewal.functions.f015_verify import verify as _case_f015_verify

async def test_verification_failure_is_reported_under_the_active_lease(self):
    verify = _case_f015_verify
    await self.process(verify)
    reports = [entry for entry in self.calls if entry[0] == 'PATCH']
    self.assertEqual(reports[0][2]['json']['status'], 'REJECTED')
    self.assertEqual(reports[0][2]['json']['evidence']['reason'], 'synthetic-invalid-proof')
