from cases.funding_note.functions.f002_root_account import root_account

async def rpc(leaves, receipt, /, method, params):
    if method == 'getSignaturesForAddress':
        return {'result': [{'signature': 'public-mock-signature', 'err': None}]}
    if method == 'getTransaction':
        return {'result': receipt}
    return {'result': {'value': root_account(leaves), 'context': {'slot': 10}}}
