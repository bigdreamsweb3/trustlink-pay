from fastapi import HTTPException
import copy

async def test_expired_lease_or_unrelated_operator_is_rejected(self):
    for change in ({'owner': 'other-cranker'}, {'expiresAt': '2000-01-01T00:00:00Z'}):
        with self.subTest(change=change):
            self.current = copy.deepcopy(self.work)
            self.current['crankerLease'].update(change)
            with self.assertRaises(HTTPException):
                await self.authorize()
