

async def request(self, /, *args, **kwargs):
    response = await self.request(*args, **kwargs)
    return self.response(409, {'error': 'LEASE_INVALID'}) if self.renewals > 1 else response
