from __future__ import annotations

from typing import Any
import base64
from app import config
from app.utils.encoding import encode_base58
from .get_program_accounts import get_program_accounts

async def read_onchain_cranker_vaults() -> list[dict[str, Any]]:
    accounts = await get_program_accounts(config.CRANKER_VAULT_ACCOUNT_SIZE)
    results: list[dict[str, Any]] = []
    supported_metadata = config.get_supported_token_metadata()
    supported_mints = set(supported_metadata.keys())
    for account in accounts:
        encoded = (((account.get("account") or {}).get("data") or [None])[0])
        if not encoded:
            continue
        try:
            data = base64.b64decode(encoded)
        except Exception:
            continue
        if len(data) != config.CRANKER_VAULT_ACCOUNT_SIZE or data[:8] != config.CRANKER_VAULT_DISCRIMINATOR:
            continue
        mint = encode_base58(data[72:104])
        if supported_mints and mint not in supported_mints:
            continue
        metadata = supported_metadata.get(mint, {})
        results.append({
            "cranker_vault": account.get("pubkey"),
            "mother_escrow": encode_base58(data[8:40]),
            "cranker": encode_base58(data[40:72]),
            "token_mint": mint,
            "token_symbol": metadata.get("symbol") or mint[:6].upper(),
            "token_name": metadata.get("name") or metadata.get("symbol") or "Token",
            "unit_price_usd": metadata.get("unit_price_usd"),
            "vault_token_account": encode_base58(data[104:136]),
            "program_total_liquidity_base_units": int.from_bytes(data[137:145], "little"),
            "program_total_shares": int.from_bytes(data[145:153], "little"),
            "program_reserved_liquidity_base_units": int.from_bytes(data[153:161], "little"),
            "program_total_withdrawn_base_units": int.from_bytes(data[161:169], "little"),
            "program_total_rewards_base_units": int.from_bytes(data[169:177], "little"),
        })
    return results
