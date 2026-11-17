from __future__ import annotations
from app.services.threshold_access import ThresholdAccessError
from cases.threshold_access.functions.f001_b64url import b64url
from datetime import datetime
from cases.threshold_access.functions.f004_fixture import fixture
from datetime import timezone
from app.services.threshold_access import verify_threshold_access_request

async def test_tampered_resource_and_device_signature_are_rejected(self) -> None:
    now = datetime.now(timezone.utc)
    request, _ = fixture(now)
    request['access']['resourceCommitment'] = '3' * 64
    with self.assertRaisesRegex(ThresholdAccessError, 'does not match'):
        verify_threshold_access_request(request, now=now)
    request, _ = fixture(now)
    request['deviceAccessProof']['signatureBase64Url'] = b64url(bytes(64))
    with self.assertRaisesRegex(ThresholdAccessError, 'device signature'):
        verify_threshold_access_request(request, now=now)
