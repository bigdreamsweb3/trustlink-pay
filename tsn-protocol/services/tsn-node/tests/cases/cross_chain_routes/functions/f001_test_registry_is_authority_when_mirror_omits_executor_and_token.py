import json
from app.services.cross_chain_routes import load_destination_routes
import os
from unittest.mock import patch

def test_registry_is_authority_when_mirror_omits_executor_and_token(self):
    payload = json.dumps([{'network': 'creditcoin-testnet', 'routeId': '0x' + '11' * 32, 'registry': '0x' + '22' * 20, 'destinationChainId': 102031}])
    with patch.dict(os.environ, {'TSN_DESTINATION_ROUTES_JSON': payload, 'TSN_CREDITCOIN_RPC_URL': 'https://rpc.cc3-testnet.creditcoin.network'}, clear=False):
        route = load_destination_routes()['creditcoin-testnet']
        self.assertIsNone(route.executor)
        self.assertIsNone(route.token)
