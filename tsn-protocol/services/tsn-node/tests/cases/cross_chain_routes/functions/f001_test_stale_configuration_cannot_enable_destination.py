import os
from unittest.mock import patch
from app.services.cross_chain_routes import ready_destination_networks

async def test_stale_configuration_cannot_enable_destination(self):
    with patch.dict(os.environ, {"TSN_DESTINATION_ROUTES_JSON": '[{"network":"base","enabled":true}]'}, clear=False):
        self.assertEqual(await ready_destination_networks(1), [])
