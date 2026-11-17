from gpru_crypto import BABYJUB_BASE8
from app.solana_pubkey import Pubkey
from tip_snapshot_sync import TIP
import hashlib
from gpru_crypto import poseidon_v1
from cases.tip_snapshot_auto_sync.functions.f002_callback import callback as _case_f002_callback

def registry_fixture(number):
    lookup = hashlib.sha256(f'lookup-{number}'.encode()).digest()
    address, bump = Pubkey.find_program_address([b'tin-v1', lookup], TIP)
    public = bytes([number + 1]) * 32
    key = hashlib.sha256(b'TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\x00' + b'\x01' + public).digest()
    x, y = [v.to_bytes(32, 'big') for v in BABYJUB_BASE8]
    policy = hashlib.sha256(b'policy').digest()
    vector = _case_f002_callback
    data = b''.join((bytes([1, bump, 1]), bytes(5), lookup, bytes(32), vector(bytes(28)), vector(bytes(20)), bytes(8 + 32), 1 .to_bytes(8, 'little'), bytes(32), b'\x01\x01', public, key, b'\x01', x, y, policy))
    leaf = poseidon_v1([int.from_bytes(v, 'big') % 21888242871839275222246405745257275088548364400416034343698204186575808495617 for v in (lookup, key, x, y, policy)])
    return (str(address), data, leaf)
