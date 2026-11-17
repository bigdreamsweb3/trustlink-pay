from server import app
import httpx

# Missing required top-level fields triggered Pydantic's full-input echo.
async def test_missing_public_field_cannot_echo_private_funding_opening(self):
    opening = {'version': 1, 'secret': '01' * 32, 'blinding': '02' * 32, 'commitment': '03' * 32}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://offline') as client:
        response = await client.post('/intents', json={'fundingNote': opening})
    self.assertEqual(response.status_code, 422)
    self.assertEqual(response.json(), {'detail': 'Invalid payment request fields'})
    for value in opening.values():
        if isinstance(value, str):
            self.assertNotIn(value, response.text)
