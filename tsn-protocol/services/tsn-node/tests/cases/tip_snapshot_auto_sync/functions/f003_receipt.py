from app.solana_pubkey import Pubkey
from cases.tip_snapshot_auto_sync.data import REGISTRIES
from tip_snapshot_sync import ROUTE_ROOT
from tip_snapshot_sync import TIP
from app.solana_pubkey import _encode_base58

def receipt(index, *, direct=False, slot=100):
    signature = _encode_base58(bytes([index + 1]) * 64)
    instruction = {'programId': str(TIP), 'accounts': [str(Pubkey(bytes([7]) * 32)), str(Pubkey(bytes([8]) * 32)), str(ROUTE_ROOT), REGISTRIES[index][0], str(Pubkey(bytes([9]) * 32)), 'Sysvar1nstructions1111111111111111111111111', '11111111111111111111111111111111'], 'data': _encode_base58(bytes([17 if direct else 21]) + bytes(32))}
    if not direct:
        instruction['accounts'].append(str(Pubkey(bytes([10]) * 32)))
    return (signature, {'slot': slot, 'version': 'legacy', 'meta': {'err': None, 'logMessages': [f'Program {TIP} invoke [1]', f'Program log: TIP V1 route appended to shared membership root at index={index}', f'Program {TIP} success']}, 'transaction': {'signatures': [signature], 'message': {'instructions': [instruction]}}})
