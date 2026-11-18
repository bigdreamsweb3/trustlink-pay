from unittest.mock import AsyncMock, Mock, patch
from fastapi import HTTPException
from server import runtime as server


async def test_unknown_height_never_issues_or_echoes_rpc_error(self):
    responses = []
    for slot in (123, 125, 127):
        responses.extend([
            {'result': {'context': {'slot': slot}, 'value': {'blockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': 1000}}},
            {'result': {'context': {'slot': slot + 1}, 'value': True}},
            HTTPException(503, 'private-provider-url?api-key=secret')])
    logger = Mock()
    with patch.object(server, 'solana_rpc', AsyncMock(side_effect=responses)) as rpc, \
            patch.object(server, 'TSN_LOCAL_FLOW_LOGS', True), patch.object(server, 'logger', logger):
        with self.assertRaises(HTTPException) as raised:
            await server.get_network_recent_blockhash()
    self.assertEqual(raised.exception.status_code, 503)
    self.assertEqual(rpc.await_count, 9)
    self.assertNotIn('secret', str(raised.exception.detail) + str(logger.mock_calls))
    logger.info.assert_not_called()
    self.assertEqual(logger.warning.call_count, 3)
