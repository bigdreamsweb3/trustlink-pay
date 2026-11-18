from unittest.mock import AsyncMock, Mock, call, patch
from server import runtime as server


async def test_fresh_issuance_preserves_tuple_and_confirmed_margin(self):
    issued = {'result': {'context': {'slot': 123}, 'value': {'blockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': 1000}}}
    logger = Mock()
    with patch.object(server, 'solana_rpc', AsyncMock(side_effect=[issued,
            {'result': {'context': {'slot': 125}, 'value': True}}, {'result': 900}])) as rpc, \
            patch.object(server, 'TSN_LOCAL_FLOW_LOGS', True), patch.object(server, 'logger', logger):
        result = await server.get_network_recent_blockhash()
    self.assertEqual(result, {'recentBlockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': 1000, 'contextSlot': 123})
    self.assertEqual(rpc.await_args_list, [
        call('getLatestBlockhash', [{'commitment': 'confirmed'}], timeout=4),
        call('isBlockhashValid', [self.blockhash_context['blockhash'], {'commitment': 'confirmed', 'minContextSlot': 123}], timeout=4),
        call('getBlockHeight', [{'commitment': 'confirmed', 'minContextSlot': 125}], timeout=4)])
    logger.info.assert_called_once()
    self.assertEqual(logger.info.call_args.args[-3:], (900, 100, 100))
    logger.warning.assert_not_called()
