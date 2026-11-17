import asyncio
from datetime import datetime
from unittest.mock import patch
from server import runtime as server
from datetime import timedelta
from datetime import timezone
from cases.receiver_lease_renewal.functions.f002_callback import callback as _case_f002_callback

def setUp(self):
    self.work = {'id': 'mock-settlement', 'kind': 'SETTLEMENT', 'status': 'NODE_VERIFYING', 'stateVersion': 12, 'payloadCommitment': 'ab' * 32, 'nodeLease': {'owner': 'mock-node', 'leaseId': 'mock-claim', 'version': 12, 'expiresAt': (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()}}
    self.calls = []
    self.renewals = 0
    self.enough_renewals = asyncio.Event()
    self.cancelled = asyncio.Event()
    self.client = object()
    self.headers = {'x-api-key': 'synthetic-test-credential'}
    for name, value in (('TSN_NODE_ID', 'mock-node'), ('RECEIVER_NODE_LEASE_RENEW_INTERVAL', 0.005), ('RECEIVER_NODE_WORK_TIMEOUT', 2), ('_sign_node_verification', _case_f002_callback)):
        item = patch.object(server, name, value)
        item.start()
        self.addCleanup(item.stop)
