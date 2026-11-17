

async def request(mutation, self, /, *args, **kwargs):
    response = await self.request(*args, **kwargs)
    if self.renewals > 1:
        body = response.json()
        body['nodeLease'].update(mutation)
        return self.response(200, body)
    return response
