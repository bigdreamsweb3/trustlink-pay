from __future__ import annotations
from app.store import FileStore
from pathlib import Path
from app.services.threshold_access import create_signed_nonce_receipt
from datetime import datetime
from cases.threshold_access.functions.f004_fixture import fixture
import json
from app.services.threshold_access import nonce_storage_key
import tempfile
from app.services.threshold_access import threshold_request_commitment
from datetime import timezone
from app.services.threshold_access import verify_threshold_access_request

async def test_exact_wallet_and_device_proof_consumes_once(self) -> None:
    now = datetime.now(timezone.utc)
    request, receipt_key = fixture(now)
    verified = verify_threshold_access_request(request, now=now)
    with tempfile.TemporaryDirectory() as directory:
        store = FileStore(Path(directory) / 'store.json')
        key = nonce_storage_key(verified)
        receipt = create_signed_nonce_receipt(verified, consumed_at=now, signing_key=receipt_key)
        self.assertTrue(await store.consume_once('nonces', key, json.dumps(receipt)))
        self.assertFalse(await store.consume_once('nonces', key, json.dumps(receipt)))
        self.assertNotIn('masterSeed', json.dumps(receipt))
        self.assertEqual(threshold_request_commitment(request), threshold_request_commitment(json.loads(json.dumps(request))))
