from server import runtime as server

async def authorize(self):
    return await server.create_settlement_authorization({'workId': self.work['id'], 'crankerPubkey': 'mock-cranker'})
