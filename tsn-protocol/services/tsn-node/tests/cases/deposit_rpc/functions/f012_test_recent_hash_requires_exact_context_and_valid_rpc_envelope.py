from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from server import runtime as server


async def test_recent_hash_requires_exact_context_and_valid_rpc_envelope(self):
    valid = {'result': {'context': {'slot': 123}, 'value': {'blockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': 1000}}}
    with patch.object(server, 'solana_rpc', AsyncMock(return_value=valid)) as rpc:
        result = await server.get_network_recent_blockhash()
        self.assertEqual(result['contextSlot'], 123)
        rpc.assert_awaited_once_with('getLatestBlockhash', [{'commitment': 'confirmed'}])
        malformed = [None, [1], {'error': {'code': -32005}, **valid}, {'result': [1]},
                     {'result': {'context': {'slot': '123'}, 'value': valid['result']['value']}},
                     {'result': {'context': {'slot': True}, 'value': valid['result']['value']}},
                     {'result': {'context': {}, 'value': valid['result']['value']}},
                     {'result': {'context': {'slot': 123}, 'value': {'blockhash': '1' * 32, 'lastValidBlockHeight': 1000}}}]
        for response in malformed:
            rpc.return_value = response
            with self.subTest(response=response), self.assertRaises(HTTPException) as raised:
                await server.get_network_recent_blockhash()
            self.assertEqual(raised.exception.status_code, 503)
