from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from server import runtime as server


async def test_recent_hash_requires_exact_context_and_valid_rpc_envelope(self):
    valid = {'result': {'context': {'slot': 123}, 'value': {'blockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': 1000}}}
    with patch.object(server, 'solana_rpc', AsyncMock(side_effect=[valid,
            {'result': {'context': {'slot': 124}, 'value': True}}, {'result': 850}])) as rpc:
        result = await server.get_network_recent_blockhash()
        self.assertEqual(result['contextSlot'], 123)
        self.assertEqual(rpc.await_args_list[0].args, ('getLatestBlockhash', [{'commitment': 'confirmed'}]))
        self.assertEqual(rpc.await_args_list[0].kwargs, {'timeout': 4})
        self.assertEqual(rpc.await_count, 3)
        malformed = [None, [1], {'error': {'code': -32005}, **valid}, {'result': [1]},
                     {'result': {'context': {'slot': '123'}, 'value': valid['result']['value']}},
                     {'result': {'context': {'slot': True}, 'value': valid['result']['value']}},
                     {'result': {'context': {}, 'value': valid['result']['value']}},
                     {'result': {'context': {'slot': 123}, 'value': {'blockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': True}}},
                     {'result': {'context': {'slot': 123}, 'value': {'blockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': '1000'}}},
                     {'result': {'context': {'slot': 123}, 'value': {'blockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': 9007199254740992}}},
                     {'result': {'context': {'slot': 123}, 'value': {'blockhash': '1' * 32, 'lastValidBlockHeight': 1000}}}]
        for response in malformed:
            rpc.side_effect = [response] * 3
            with self.subTest(response=response), self.assertRaises(HTTPException) as raised:
                await server.get_network_recent_blockhash()
            self.assertEqual(raised.exception.status_code, 503)
