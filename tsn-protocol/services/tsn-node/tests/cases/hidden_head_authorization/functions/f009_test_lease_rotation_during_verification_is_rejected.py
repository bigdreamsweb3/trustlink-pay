from fastapi import HTTPException
import copy

async def test_lease_rotation_during_verification_is_rejected(self):
    fresh = copy.deepcopy(self.work)
    fresh['stateVersion'] += 1
    fresh['crankerLease']['leaseId'] = 'rotated'
    self.lookup.side_effect = [copy.deepcopy(self.work), self.funding, fresh]
    with self.assertRaisesRegex(HTTPException, 'lease changed'):
        await self.authorize()
