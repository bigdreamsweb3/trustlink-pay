from __future__ import annotations
from datetime import datetime
from cases.threshold_access.functions.f004_fixture import fixture
from app.services.threshold_access import threshold_request_commitment
from datetime import timezone

async def test_request_commitment_rejects_an_altered_retry(self) -> None:
    now = datetime.now(timezone.utc)
    request, _ = fixture(now)
    original = threshold_request_commitment(request)
    request['pkpId'] = 'different-pkp'
    self.assertNotEqual(original, threshold_request_commitment(request))
