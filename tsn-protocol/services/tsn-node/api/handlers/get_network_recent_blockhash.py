"""get_network_recent_blockhash: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import HTTPException
from typing import Any, Callable, Protocol
from networking.solana.funding_blockhash_candidate import funding_blockhash_candidate
from networking.solana.funding_blockhash_height import funding_blockhash_height
from networking.solana.funding_blockhash_validity import funding_blockhash_validity
from networking.solana.funding_blockhash_issuance import (
    FUNDING_BLOCKHASH_ISSUE_ATTEMPTS, FUNDING_BLOCKHASH_MIN_REMAINING_BLOCKS,
    FUNDING_BLOCKHASH_READ_TIMEOUT_SECONDS,
)

class Dependencies(Protocol):
    solana_rpc: Callable[..., Any]
    TSN_LOCAL_FLOW_LOGS: bool
    logger: Any


async def get_network_recent_blockhash(node: Dependencies) -> dict[str, Any]:
    """Issue an unchanged RPC tuple only after confirmed visibility and signing headroom checks.

    Three candidates and four-second per-endpoint RPC reads bound unavailable/stale
    provider retries. Every subsequent read carries a nondecreasing minimum slot.
    The height margin is an unsigned preparation check, not an expiry clock or
    evidence that any previously signed transaction did not execute.
    """
    minimum_slot = 0
    for attempt in range(1, FUNDING_BLOCKHASH_ISSUE_ATTEMPTS + 1):
        requested_at = datetime.now(timezone.utc).isoformat()
        fingerprint = None
        observed_height = None
        remaining_blocks = None
        issuing_slot = None
        reason = "RPC_UNAVAILABLE_OR_INVALID"
        try:
            options = {"commitment": "confirmed"}
            if minimum_slot:
                options["minContextSlot"] = minimum_slot
            response = await node.solana_rpc("getLatestBlockhash", [options], timeout=FUNDING_BLOCKHASH_READ_TIMEOUT_SECONDS)
            context, fingerprint = funding_blockhash_candidate(response, minimum_slot)
            issuing_slot = context.contextSlot
            minimum_slot = issuing_slot
            validity = await node.solana_rpc("isBlockhashValid", [context.blockhash,
                {"commitment": "confirmed", "minContextSlot": minimum_slot}], timeout=FUNDING_BLOCKHASH_READ_TIMEOUT_SECONDS)
            valid, minimum_slot = funding_blockhash_validity(validity, minimum_slot)
            height = await node.solana_rpc("getBlockHeight", [{"commitment": "confirmed", "minContextSlot": minimum_slot}],
                timeout=FUNDING_BLOCKHASH_READ_TIMEOUT_SECONDS)
            observed_height = funding_blockhash_height(height)
            remaining_blocks = context.lastValidBlockHeight - observed_height
            if valid and remaining_blocks >= FUNDING_BLOCKHASH_MIN_REMAINING_BLOCKS:
                if node.TSN_LOCAL_FLOW_LOGS:
                    node.logger.info("TSN funding blockhash issued: attempt=%s requestedAt=%s issuedAt=%s hashFingerprint=%s issuingContextSlot=%s checkedContextSlot=%s observedBlockHeight=%s remainingBlocks=%s minimumRemainingBlocks=%s",
                        attempt, requested_at, datetime.now(timezone.utc).isoformat(), fingerprint, issuing_slot, minimum_slot,
                        observed_height, remaining_blocks, FUNDING_BLOCKHASH_MIN_REMAINING_BLOCKS)
                return {"recentBlockhash": context.blockhash, "lastValidBlockHeight": context.lastValidBlockHeight,
                    "contextSlot": context.contextSlot}
            reason = "HASH_NOT_VALID" if not valid else "INSUFFICIENT_SIGNING_MARGIN"
        except (ValueError, HTTPException):
            pass
        if node.TSN_LOCAL_FLOW_LOGS:
            node.logger.warning("TSN funding blockhash candidate refused: attempt=%s requestedAt=%s checkedAt=%s hashFingerprint=%s issuingContextSlot=%s checkedContextSlot=%s observedBlockHeight=%s remainingBlocks=%s minimumRemainingBlocks=%s reason=%s",
                attempt, requested_at, datetime.now(timezone.utc).isoformat(), fingerprint, issuing_slot, minimum_slot,
                observed_height, remaining_blocks, FUNDING_BLOCKHASH_MIN_REMAINING_BLOCKS, reason)
    raise HTTPException(503, "Solana RPC could not provide a confirmed funding blockhash with sufficient signing time; retry before signing")
