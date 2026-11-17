

async def request(self, /, *args, **kwargs):
    response = await self.request(*args, **kwargs)
    return self.response(409, {'error': 'LEASE_INVALID', 'private': 'must-not-appear'}) if args[1] == 'PATCH' else response
