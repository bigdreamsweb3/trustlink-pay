from hidden_head_witness import SparseTree
import base64
from funding_note import funded_leaf
from funding_snapshot_sync import funding_root_address
import hashlib
from cases.funding_note.functions.f002_root_account import root_account

def append_event(index, opening, token, amount, leaves):
    address, _ = funding_root_address()
    leaf = funded_leaf(opening['commitment'], token, amount)
    root = SparseTree(32, dict(enumerate(leaves))).root
    event = hashlib.sha256(b'event:PrivateFundingDepositedV1').digest()[:8] + bytes(address) + index.to_bytes(8, 'little') + bytes.fromhex(opening['commitment']) + token.to_bytes(4, 'little') + amount.to_bytes(8, 'little') + leaf.to_bytes(32, 'big') + root.to_bytes(32, 'big')
    program = root_account([])['owner']
    return {'meta': {'err': None, 'logMessages': [f'Program {program} invoke [1]', 'Program data: ' + base64.b64encode(event).decode(), f'Program {program} success']}}
