

async def paginated(first, original, remaining, /, method, params):
    if method == 'getSignaturesForAddress':
        return {'result': remaining if 'before' in params[1] else first}
    return await original(method, params)
