

async def rpc(base, work, /, method, params):
    result = await base(method, params)
    if method == 'isBlockhashValid':
        work['crankerLease']['expiresAt'] = '2000-01-01T00:00:00Z'
    return result
