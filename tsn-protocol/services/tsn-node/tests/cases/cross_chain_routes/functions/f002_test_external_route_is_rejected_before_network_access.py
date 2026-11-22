from unittest.mock import patch
from app.services.cross_chain_routes import verify_destination_route

async def test_external_route_is_rejected_before_network_access(self):
    with patch("httpx.AsyncClient.request") as request:
        for network in ("base", "arbitrum", "polygon", "ethereum", "unknown"):
            with self.subTest(network=network):
                with self.assertRaisesRegex(ValueError, "cross-network settlement is not enabled"):
                    await verify_destination_route(network=network, route_id="0x" + "11" * 32,
                        executor="0x" + "22" * 20, token="0x" + "33" * 20,
                        requested_amount=1, now_seconds=1)
        request.assert_not_called()
