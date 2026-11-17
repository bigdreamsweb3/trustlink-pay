import copy
from cases.private_credit_coordination.functions.f016_rpc import rpc as _case_f016_rpc
from functools import partial

async def test_latest_hash_response_requires_canonical_hash_and_positive_u64_metadata(self):
    from server import runtime as server
    fixture = self.signing_fixture()
    fresh = fixture[4]
    valid = {'result': {'context': {'slot': 140}, 'value': {'blockhash': fresh, 'lastValidBlockHeight': 1000}}}
    cases = [None, [], {}, {'result': []}, {'result': {'value': None}}]
    for field in ('lastValidBlockHeight', 'slot'):
        for bad in (None, 0, -1, True, 140.0, '140', 2 ** 64, {}):
            changed = copy.deepcopy(valid)
            target = changed['result']['context'] if field == 'slot' else changed['result']['value']
            target[field] = bad
            cases.append(changed)
    for bad in (None, '', fresh + '1', '0' * 32, '11111111111111111111111111111111', []):
        changed = copy.deepcopy(valid)
        changed['result']['value']['blockhash'] = bad
        cases.append(changed)
    for response in cases:
        fixture = self.signing_fixture()
        rpc = partial(_case_f016_rpc, response, self)
        with self.assertRaises(server.HTTPException) as rejected:
            await self.sign_fixture(fixture, rpc)
        self.assertEqual(rejected.exception.detail, 'TCAP_TRANSACTION_BLOCKHASH_LIFETIME_INVALID')
        fixture[-1].sign.assert_not_called()
