"""_assert_mother_authority_key_matches_chain: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from fastapi import HTTPException
from nacl.signing import SigningKey
import base64
import binascii
import hashlib
import hmac
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_PROGRAM_ID: Any
    get_mother_escrow_pda: Callable[..., Any]
    solana_rpc: Callable[..., Any]


async def _assert_mother_authority_key_matches_chain(node: Dependencies, signing_key: SigningKey) -> str:
    mother = node.get_mother_escrow_pda()
    response = await node.solana_rpc("getAccountInfo", [str(mother), {"encoding": "base64", "commitment": "confirmed"}])
    account = ((response.get("result") or {}).get("value"))
    if not isinstance(account, dict) or str(account.get("owner") or "") != node.TSN_PROGRAM_ID:
        raise HTTPException(503, "Mother Escrow is missing or not owned by the configured TSN program")
    try:
        data = base64.b64decode((account.get("data") or [""])[0], validate=True)
    except (ValueError, TypeError, binascii.Error) as exc:
        raise HTTPException(503, "Mother Escrow account data is invalid") from exc
    expected_discriminator = hashlib.sha256(b"account:MotherEscrow").digest()[:8]
    if len(data) < 40 or data[:8] != expected_discriminator:
        raise HTTPException(503, "Mother Escrow account layout is invalid")
    authority = data[8:40]
    if not hmac.compare_digest(authority, bytes(signing_key.verify_key)):
        raise HTTPException(403, "Mother Node key does not match the on-chain Mother authority")
    return str(Pubkey(authority))
