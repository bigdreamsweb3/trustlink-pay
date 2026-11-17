import copy
from datetime import datetime
from datetime import timedelta
from datetime import timezone

async def request(self, client, method, path, **kwargs):
    self.calls.append((method, path, copy.deepcopy(kwargs)))
    if method == 'PUT':
        self.renewals += 1
        if self.renewals >= 4:
            self.enough_renewals.set()
        lease = {**self.work['nodeLease'], 'expiresAt': (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()}
        return self.response(200, {'id': self.work['id'], 'stateVersion': 12, 'nodeLease': lease})
    return self.response(200, {'status': 'VERIFIED'})
