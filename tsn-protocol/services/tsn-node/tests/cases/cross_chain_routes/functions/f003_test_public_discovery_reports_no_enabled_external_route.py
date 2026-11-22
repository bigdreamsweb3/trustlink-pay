from types import SimpleNamespace
from app.services.cross_chain_routes import ready_destination_networks
from api.handlers.get_settlement_networks import get_settlement_networks

async def test_public_discovery_reports_no_enabled_external_route(self):
    node = SimpleNamespace(ready_destination_networks=ready_destination_networks)
    self.assertEqual(await get_settlement_networks(node), [])
