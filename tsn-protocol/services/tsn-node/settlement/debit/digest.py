"""Hash the complete 26-input debit statement for TSNP authorization."""
import hashlib
from app.solana_pubkey import Pubkey
from .contract import CONTEXT_FIELDS


def debit_digest(accounts: dict, public_inputs: list[str]) -> str:
    context = b"".join(bytes(Pubkey.from_string(accounts[name])) for name in CONTEXT_FIELDS)
    return hashlib.sha256(b"TSN_GPRU_TIN_DEBIT_AUTHORIZATION_V1\0" + context + b"".join(bytes.fromhex(value) for value in public_inputs)).hexdigest()
