"""Validate funding routing context and bind it to the unchanged signed hash.

The tuple is a client-reported routing/retry hint, not an issuer signature or
proof of nonexecution. Existing wallet and Node signatures cover other scopes.
Malformed context and hash substitution fail before slow authorization or RPC.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol
from app.solana_pubkey import Pubkey
from core.schemas.sender_funding_blockhash_context import SenderFundingBlockhashContext
from .parse_signed_tcap_deposit_message import _parse_signed_tcap_deposit_message


class Dependencies(Protocol):
    _read_solana_shortvec: Callable[..., Any]


def _funding_blockhash_context(node: Dependencies, transaction_base64: str, context: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(context, dict):
        raise ValueError("TSN_FUNDING_BLOCKHASH_CONTEXT_INVALID")
    parsed = SenderFundingBlockhashContext(**context)
    try:
        decoded = bytes(Pubkey.from_string(parsed.blockhash))
    except ValueError as exc:
        raise ValueError("TSN_FUNDING_BLOCKHASH_CONTEXT_INVALID") from exc
    if not any(decoded) or str(Pubkey(decoded)) != parsed.blockhash:
        raise ValueError("TSN_FUNDING_BLOCKHASH_CONTEXT_INVALID")
    _, _, _, signed_hash = _parse_signed_tcap_deposit_message(node, transaction_base64)
    if signed_hash != parsed.blockhash:
        raise ValueError("TSN_FUNDING_SIGNED_BLOCKHASH_MISMATCH: wallet-signed deposit does not use its prepared blockhash")
    return parsed.model_dump()
