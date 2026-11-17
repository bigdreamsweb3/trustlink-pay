from cases.receiver_lease_renewal.functions.f010_request import request as _case_f010_request
from functools import partial

async def test_lease_loss_cancels_verification_without_rejection_or_report(self):
    request = partial(_case_f010_request, self)
    with self.assertRaisesRegex(RuntimeError, 'LEASE_LOST'):
        await self.process(self.never_finishes, request)
    self.assertTrue(self.cancelled.is_set())
    self.assertFalse(any((method == 'PATCH' for method, _, _ in self.calls)))
