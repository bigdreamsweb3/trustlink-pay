from cases.funding_note.functions.f002_root_account import root_account

async def rpc(fetched, leaves, receipt, /, method, params):
    if method == 'getSignaturesForAddress':
        return {'result': [{'signature': 'latest-public-mock-signature', 'err': None}]}
    if method == 'getTransaction':
        fetched.append(params[0])
        return {'result': receipt}
    return {'result': {'value': root_account(leaves), 'context': {'slot': 10}}}
