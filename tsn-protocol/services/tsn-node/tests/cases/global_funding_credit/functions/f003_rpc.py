from funding_snapshot_sync import funding_root_address
from test_funding_note import root_account

async def rpc(leaves, methods, receipt, self, /, method, params):
    methods.append(method)
    if method == 'getAccountInfo':
        self.assertEqual(params[0], str(funding_root_address()[0]))
        return {'result': {'value': root_account(leaves), 'context': {'slot': 10}}}
    if method == 'getSignaturesForAddress':
        return {'result': [{'signature': 'offline-confirmed-deposit', 'err': None}]}
    if method == 'getTransaction':
        return {'result': receipt}
    if method == 'getSlot':
        return {'result': 10}
    raise AssertionError(f'Unexpected RPC before witness preparation: {method}')
