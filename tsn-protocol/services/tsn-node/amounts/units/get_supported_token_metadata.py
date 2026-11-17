"""get_supported_token_metadata: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
import json
import os
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    DEVNET_USDC_MINT: Any
    parse_optional_float: Callable[..., Any]


def get_supported_token_metadata(node: Dependencies) -> dict[str, dict[str, Any]]:
    raw = os.environ.get("SOLANA_ALLOWED_SPL_TOKENS", "").strip()
    default = {
        node.DEVNET_USDC_MINT: {
            "symbol": "USDC",
            "name": "USD Coin",
            "decimals": 6,
            "unit_price_usd": 1.0,
        }
    }
    if not raw:
        return default
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return default
    if not isinstance(parsed, list):
        return default
    metadata = {}
    for token in parsed:
        if not isinstance(token, dict):
            continue
        mint = str(token.get("mintAddress", "")).strip()
        if not mint:
            continue
        unit_price_usd = node.parse_optional_float(
            token.get("unitPriceUsd")
            or token.get("unit_price_usd")
            or token.get("priceUsd")
            or token.get("usdPrice")
        )
        symbol = str(token.get("symbol") or "").upper()
        metadata[mint] = {
            "symbol": token.get("symbol") or mint[:6].upper(),
            "name": token.get("name") or token.get("symbol") or "Token",
            "decimals": int(token.get("decimals") or 0),
            "unit_price_usd": unit_price_usd if unit_price_usd is not None else (1.0 if symbol in {"USDC", "USDT"} else None),
        }
    return metadata or default
