"""Bind debit approvals to canonical deployment and asset accounts."""
import hashlib
from app.solana_pubkey import Pubkey
from .contract import CONTEXT_FIELDS, FIELD


def debit_deployment(accounts: dict) -> str:
    context = b"".join(bytes(Pubkey.from_string(accounts[name])) for name in CONTEXT_FIELDS)
    digest = hashlib.sha256(b"TSN_GPRU_TCAP_TIN_DEBIT_CONTEXT_V1\0" + context).digest()
    return format(int.from_bytes(digest, "big") % FIELD, "064x")
