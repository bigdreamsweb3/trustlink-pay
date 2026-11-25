import httpx
from server import app


async def test_loopback_only(self):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=("203.0.113.5", 1000)), base_url="http://node") as client:
        response = await client.get("/network/recent-blockhash")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"error": "TSN_NODE_LOCAL_ACCESS_ONLY"})
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://node") as client:
        response = await client.post("/network/funding/complete", json={})
        self.assertEqual(response.status_code, 422)
