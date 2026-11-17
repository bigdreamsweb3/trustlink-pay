from fastapi import HTTPException
from datetime import datetime
from server import runtime as server
from datetime import timedelta
from datetime import timezone

def test_cranker_lease_must_be_current_and_owned(self):
    work = {'kind': 'SETTLEMENT', 'status': 'CRANKER_LEASED', 'crankerLease': {'owner': 'mock operator', 'expiresAt': (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()}}
    server._assert_current_settlement_lease(work, 'mock operator')
    with self.assertRaisesRegex(HTTPException, 'not leased'):
        server._assert_current_settlement_lease(work, 'another operator')
    work['crankerLease']['expiresAt'] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    with self.assertRaisesRegex(HTTPException, 'expired'):
        server._assert_current_settlement_lease(work, 'mock operator')
