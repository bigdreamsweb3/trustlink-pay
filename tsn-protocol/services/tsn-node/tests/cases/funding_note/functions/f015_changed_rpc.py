from cases.funding_note.functions.f002_root_account import root_account

async def changed_rpc(leaves, rpc, /, method, params):
    if method == 'getAccountInfo':
        return {'result': {'value': root_account(leaves + [2]), 'context': {'slot': 11}}}
    return await rpc(method, params)
