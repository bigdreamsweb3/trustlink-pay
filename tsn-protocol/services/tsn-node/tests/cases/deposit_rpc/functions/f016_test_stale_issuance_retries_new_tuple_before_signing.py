from unittest.mock import AsyncMock, call, patch
from app.solana_pubkey import Pubkey
from server import runtime as server


async def test_stale_issuance_retries_new_tuple_before_signing(self):
    fresh = str(Pubkey(bytes([98]) * 32))
    responses = [
        {'result': {'context': {'slot': 123}, 'value': {'blockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': 1000}}},
        {'result': {'context': {'slot': 125}, 'value': False}}, {'result': 1001},
        {'result': {'context': {'slot': 126}, 'value': {'blockhash': fresh, 'lastValidBlockHeight': 1150}}},
        {'result': {'context': {'slot': 127}, 'value': True}}, {'result': 1002}]
    with patch.object(server, 'solana_rpc', AsyncMock(side_effect=responses)) as rpc:
        result = await server.get_network_recent_blockhash()
    self.assertEqual(result, {'recentBlockhash': fresh, 'lastValidBlockHeight': 1150, 'contextSlot': 126})
    self.assertEqual(rpc.await_count, 6)
    self.assertEqual(rpc.await_args_list[3], call('getLatestBlockhash', [{'commitment': 'confirmed', 'minContextSlot': 125}], timeout=4))
