from functools import partial
from unittest.mock import Mock, patch
import httpx
from server import runtime as server
from cases.deposit_rpc.functions.f003_client import client as fixture_client
from cases.deposit_rpc.functions.f014_transport_envelope import transport_envelope


async def test_malformed_common_rpc_falls_through_without_raw_diagnostics(self):
    real_client = httpx.AsyncClient
    for malformed in (None, [1], 'invalid', 7, {}):
        client = partial(fixture_client, partial(transport_envelope, malformed), real_client)
        logger = Mock()
        with self.subTest(malformed=malformed), patch.object(server.httpx, 'AsyncClient', client), \
                patch.object(server, 'TSN_SOLANA_RPC_URLS', ['https://one.test', 'https://two.test']), patch.object(server, 'logger', logger):
            response = await server.solana_rpc('getHealth', [])
        self.assertEqual(response['result'], 'ok')
        logger.warning.assert_called_once_with('Solana RPC unavailable for %s providerIndex=%s category=%s', 'getHealth', 0, 'ValueError')
