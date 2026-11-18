from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from server import runtime as server


async def test_low_signing_margin_exhausts_bounded_issuance(self):
    responses = []
    for slot in (123, 125, 127):
        responses.extend([
            {'result': {'context': {'slot': slot}, 'value': {'blockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': 1000}}},
            {'result': {'context': {'slot': slot + 1}, 'value': True}}, {'result': 901}])
    with patch.object(server, 'solana_rpc', AsyncMock(side_effect=responses)) as rpc:
        with self.assertRaises(HTTPException) as raised:
            await server.get_network_recent_blockhash()
    self.assertEqual(raised.exception.status_code, 503)
    self.assertIn('retry before signing', raised.exception.detail)
    self.assertEqual(rpc.await_count, 9)
    self.assertEqual([entry.args[1][0].get('minContextSlot', 0) for entry in rpc.await_args_list if entry.args[0] == 'getLatestBlockhash'], [0, 124, 126])
