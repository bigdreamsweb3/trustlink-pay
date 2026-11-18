import hashlib
from unittest.mock import AsyncMock, Mock, patch
from server import runtime as server


async def test_issuance_logs_only_gated_sanitized_context(self):
    for enabled in (False, True):
        logger = Mock()
        responses = [{'result': {'context': {'slot': 123}, 'value': {'blockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': 1000}}},
            {'result': {'context': {'slot': 124}, 'value': True}}, {'result': 850}]
        with self.subTest(enabled=enabled), patch.object(server, 'solana_rpc', AsyncMock(side_effect=responses)), \
                patch.object(server, 'TSN_LOCAL_FLOW_LOGS', enabled), patch.object(server, 'logger', logger):
            await server.get_network_recent_blockhash()
        if enabled:
            logger.info.assert_called_once()
            fields = logger.info.call_args.args
            self.assertEqual(fields[4], hashlib.sha256(bytes([99]) * 32).hexdigest()[:16])
            self.assertIn('requestedAt=', fields[0])
            self.assertIn('issuedAt=', fields[0])
            self.assertNotIn(self.blockhash_context['blockhash'], str(logger.mock_calls))
        else:
            self.assertEqual(logger.mock_calls, [])
