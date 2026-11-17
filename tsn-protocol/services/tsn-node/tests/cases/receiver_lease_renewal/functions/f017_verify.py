from fastapi import HTTPException

async def verify(attempts, /, work):
    pass
    attempts.value += 1
    if attempts.value == 1:
        raise HTTPException(503, 'Solana RPC unavailable')
    return {'verifiedPayload': {}, 'verificationType': 'mock-proof'}
