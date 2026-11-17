from hidden_head_witness import SparseTree
from cases.funding_note.functions.f002_root_account import root_account

async def rpc(leaves, /, method, params):
    later = leaves + [2]
    latest = SparseTree(32, dict(enumerate(later))).root
    return {'result': {'value': root_account(later, history=[(latest, 2)]), 'context': {'slot': 11}}}
