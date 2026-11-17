from fastapi import HTTPException
import httpx

async def test_mixed_invalid_and_unknown_is_retryable_in_either_order(self):
    rejected = {'result': {'value': {'err': 'BlockhashNotFound'}}}
    for unknown in (httpx.ReadTimeout('synthetic-timeout'), {'error': {'code': -32005}}, {}, None, {'result': {'value': {}}}):
        for outcomes in ([rejected, unknown], [unknown, rejected]):
            with self.subTest(outcomes=outcomes):
                with self.assertRaises(HTTPException) as raised:
                    await self.simulate(outcomes)
                self.assertEqual(raised.exception.status_code, 503)
