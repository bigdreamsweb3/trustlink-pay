from __future__ import annotations
from app.services.threshold_access import ThresholdAccessError
from datetime import datetime
from cases.threshold_access.functions.f004_fixture import fixture
from datetime import timedelta
from datetime import timezone
from app.services.threshold_access import verify_threshold_access_request

async def test_expired_proof_is_rejected(self) -> None:
    issued = datetime.now(timezone.utc) - timedelta(minutes=10)
    request, _ = fixture(issued)
    with self.assertRaisesRegex(ThresholdAccessError, 'expired'):
        verify_threshold_access_request(request)
