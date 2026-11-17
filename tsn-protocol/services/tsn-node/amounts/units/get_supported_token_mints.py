"""get_supported_token_mints: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
import json
import os
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    DEVNET_USDC_MINT: Any
    logger: Any


def get_supported_token_mints(node: Dependencies) -> set[str]:
    raw = os.environ.get("SOLANA_ALLOWED_SPL_TOKENS", "").strip()
    if not raw:
        return {node.DEVNET_USDC_MINT}
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return {node.DEVNET_USDC_MINT}
        mints = {
            str(token.get("mintAddress", "")).strip()
            for token in parsed
            if isinstance(token, dict) and str(token.get("mintAddress", "")).strip()
        }
        return mints or {node.DEVNET_USDC_MINT}
    except json.JSONDecodeError:
        node.logger.warning("SOLANA_ALLOWED_SPL_TOKENS was invalid JSON; using devnet USDC only")
        return {node.DEVNET_USDC_MINT}
