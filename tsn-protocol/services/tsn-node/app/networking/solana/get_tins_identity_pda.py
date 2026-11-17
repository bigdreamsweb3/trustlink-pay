from __future__ import annotations

from app.solana_pubkey import Pubkey
from app import config
from app.utils.encoding import decode_base58
from .get_tins_program_pubkey import get_tins_program_pubkey
import hashlib

def get_tins_identity_pda(owner_pubkey: str) -> Pubkey:
    owner_bytes = decode_base58(owner_pubkey)
    identity_seed = hashlib.sha256(owner_bytes + config.TINS_PROGRAM_SALT).digest()
    return Pubkey.find_program_address([b"identity", identity_seed], get_tins_program_pubkey())[0]
