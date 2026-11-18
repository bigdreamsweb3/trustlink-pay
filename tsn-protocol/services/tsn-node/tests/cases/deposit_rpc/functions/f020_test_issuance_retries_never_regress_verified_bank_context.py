from unittest.mock import AsyncMock, call, patch
from server import runtime as server


async def test_issuance_retries_never_regress_verified_bank_context(self):
    value = {'blockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': 1000}
    responses = [
        {'result': {'context': {'slot': 123}, 'value': value}},
        {'result': {'context': {'slot': 129}, 'value': True}}, {'result': 901},
        {'result': {'context': {'slot': 128}, 'value': value}},
        {'result': {'context': {'slot': 130}, 'value': value}},
        {'result': {'context': {'slot': 131}, 'value': True}}, {'result': 900}]
    with patch.object(server, 'solana_rpc', AsyncMock(side_effect=responses)) as rpc:
        result = await server.get_network_recent_blockhash()
    self.assertEqual(result['contextSlot'], 130)
    self.assertEqual(rpc.await_count, 7)
    self.assertEqual(rpc.await_args_list[3], call('getLatestBlockhash', [{'commitment': 'confirmed', 'minContextSlot': 129}], timeout=4))
    self.assertEqual(rpc.await_args_list[4], call('getLatestBlockhash', [{'commitment': 'confirmed', 'minContextSlot': 129}], timeout=4))
    self.assertEqual(rpc.await_args_list[6], call('getBlockHeight', [{'commitment': 'confirmed', 'minContextSlot': 131}], timeout=4))
