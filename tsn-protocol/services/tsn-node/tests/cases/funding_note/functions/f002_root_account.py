from hidden_head_witness import SparseTree
import base64
from funding_snapshot_sync import funding_root_address
import hashlib

def root_account(leaves, history=None, cursor=None):
    _, bump = funding_root_address()
    tree = SparseTree(32, dict(enumerate(leaves)))
    records = history if history is not None else [(SparseTree(32, dict(enumerate(leaves[:count]))).root, count) for count in range(max(1, len(leaves) - 127), len(leaves) + 1)]
    next_cursor = len(records) % 128 if cursor is None else cursor
    slots = [bytes(40)] * 128
    for index, (root, count) in enumerate(records):
        position = (next_cursor + index) % 128 if len(records) == 128 else index
        slots[position] = root.to_bytes(32, 'big') + count.to_bytes(8, 'little')
    data = hashlib.sha256(b'account:TcapFundingMerkleRootV1').digest()[:8] + b'\x02\x00\x01\x00' + bytes([bump]) + tree.root.to_bytes(32, 'big') + len(leaves).to_bytes(8, 'little') + 32 .to_bytes(4, 'little') + bytes(1024) + 128 .to_bytes(4, 'little') + b''.join(slots) + next_cursor.to_bytes(2, 'little') + len(records).to_bytes(2, 'little')
    return {'owner': 'tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF', 'data': [base64.b64encode(data).decode(), 'base64']}
