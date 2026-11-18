from fastapi import HTTPException
import httpx


async def test_invalid_bank_context_and_unknown_height_remain_retryable(self):
    for slot in (122, True, '123', None):
        with self.subTest(slot=slot), self.assertRaises(HTTPException) as raised:
            await self.simulate([{'result': {'context': {'slot': slot}, 'value': {'err': None}}}] * 2)
        self.assertEqual(raised.exception.status_code, 503)
    for height in (None, True, -1, '1001', httpx.ReadTimeout('synthetic-timeout')):
        with self.subTest(height=height), self.assertRaises(HTTPException) as raised:
            await self.simulate([{'result': {'value': {'err': 'BlockhashNotFound'}}}] * 2, bank_height=height)
        self.assertEqual(raised.exception.status_code, 503)
