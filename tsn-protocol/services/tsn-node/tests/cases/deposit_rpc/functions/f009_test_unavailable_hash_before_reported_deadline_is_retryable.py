from fastapi import HTTPException


async def test_unavailable_hash_before_reported_deadline_is_retryable(self):
    for height in (999, 1000):
        with self.subTest(height=height), self.assertRaises(HTTPException) as raised:
            await self.simulate([{'result': {'value': {'err': 'BlockhashNotFound'}}}] * 2, bank_height=height)
        self.assertEqual(raised.exception.status_code, 503)
