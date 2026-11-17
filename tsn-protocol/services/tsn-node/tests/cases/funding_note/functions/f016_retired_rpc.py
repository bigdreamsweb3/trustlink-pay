from hidden_head_witness import SparseTree
from cases.funding_note.functions.f002_root_account import root_account

async def retired_rpc(leaves, rpc, /, method, params):
    if method == 'getAccountInfo':
        later = leaves + [2]
        last_root = SparseTree(32, dict(enumerate(later))).root
        return {'result': {'value': root_account(later, history=[(last_root, 2)]), 'context': {'slot': 11}}}
    return await rpc(method, params)
