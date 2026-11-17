from app.services.cross_chain_routes import configured_destination_networks
import json
from app.services.cross_chain_routes import load_destination_routes
import os
from unittest.mock import patch

def test_route_config_requires_exact_executor_and_token_fields(self):
    payload = json.dumps([{'network': 'base', 'routeId': '0x' + '11' * 32, 'registry': '0x' + '22' * 20, 'executor': '0x' + '33' * 20, 'token': '0x' + '44' * 20, 'destinationChainId': 8453}])
    with patch.dict(os.environ, {'TSN_DESTINATION_ROUTES_JSON': payload, 'TSN_CREDITCOIN_RPC_URL': 'https://rpc.cc3-testnet.creditcoin.network'}, clear=False):
        routes = load_destination_routes()
        self.assertEqual(routes['base'].executor, '0x' + '33' * 20)
        self.assertEqual(routes['base'].token, '0x' + '44' * 20)
        self.assertEqual(configured_destination_networks()[0]['chainId'], 8453)
