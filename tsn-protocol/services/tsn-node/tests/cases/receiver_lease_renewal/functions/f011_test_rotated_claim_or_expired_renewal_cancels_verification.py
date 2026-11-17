from cases.receiver_lease_renewal.functions.f012_request import request as _case_f012_request
from functools import partial

async def test_rotated_claim_or_expired_renewal_cancels_verification(self):
    for mutation in ({'version': 14}, {'expiresAt': '2000-01-01T00:00:00Z'}):
        with self.subTest(mutation=mutation):
            self.renewals = 0
            self.cancelled.clear()
            request = partial(_case_f012_request, mutation, self)
            with self.assertRaisesRegex(RuntimeError, 'LEASE_LOST'):
                await self.process(self.never_finishes, request)
            self.assertTrue(self.cancelled.is_set())
    self.assertFalse(any((method == 'PATCH' for method, _, _ in self.calls)))
