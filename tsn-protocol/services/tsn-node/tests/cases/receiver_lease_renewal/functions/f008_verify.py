

async def verify(self, /, work):
    await self.enough_renewals.wait()
    return {'verifiedPayload': {'tcapCreditTransition': {'tokenId': 1}}, 'verificationType': 'mock-proof'}
