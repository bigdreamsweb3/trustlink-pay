import httpx
from server import app


async def test_funding_route_privacy(self):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://offline') as client:
        for path in ('/intents', '/network/funding/readiness', '/network/funding/complete'):
            response = await client.post(path, json={'senderFundingDepositTxB64': 'private-wire', 'authorizationSignature': 'secret-auth'})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json(), {'detail': 'Invalid payment request fields'})
