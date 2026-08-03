from __future__ import annotations

import base64
import binascii
import hashlib
import time
from typing import Any, Optional

import httpx
from fastapi import HTTPException
from nacl.signing import SigningKey
from solders.pubkey import Pubkey

from . import config
from .utils.encoding import decode_base58, decode_secret_key, encode_base58


def get_program_pubkey() -> Pubkey:
    return Pubkey.from_string(config.TSN_PROGRAM_ID)


def find_tsn_pda(*seeds: bytes) -> Pubkey:
    return Pubkey.find_program_address(list(seeds), get_program_pubkey())[0]


def get_mother_escrow_pda() -> Pubkey:
    return find_tsn_pda(b"tsn_mother_escrow")


def get_private_replay_registry_pda() -> Pubkey:
    return find_tsn_pda(b"tsn_private_replay", bytes(get_mother_escrow_pda()))


def get_cranker_pda(operator: Pubkey) -> Pubkey:
    return find_tsn_pda(b"tsn_cranker", bytes(get_mother_escrow_pda()), bytes(operator))


def get_cranker_vault_pda(operator: Pubkey, token_mint: Pubkey) -> Pubkey:
    return find_tsn_pda(b"tsn_cranker_vault", bytes(get_cranker_pda(operator)), bytes(token_mint))


def get_cranker_vault_token_pda(cranker_vault: Pubkey) -> Pubkey:
    return find_tsn_pda(b"tsn_cranker_vault_token", bytes(cranker_vault))


def get_associated_token_address(owner: Pubkey, token_mint: Pubkey) -> Pubkey:
    return Pubkey.find_program_address(
        [bytes(owner), bytes(config.TOKEN_PROGRAM_ID), bytes(token_mint)],
        config.ASSOCIATED_TOKEN_PROGRAM_ID,
    )[0]


async def get_token_account_balance_ui(token_account: str) -> tuple[float, int]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": "getTokenAccountBalance", "params": [token_account]}
    async with httpx.AsyncClient(timeout=12) as client:
        response = await client.post(config.TSN_SOLANA_RPC_URL, json=payload)
    response.raise_for_status()
    value = response.json().get("result", {}).get("value", {})
    return float(value.get("uiAmountString") or value.get("uiAmount") or 0), int(value.get("decimals") or 0)


async def solana_rpc(method: str, params: list[Any], timeout: float = 12) -> dict[str, Any]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(config.TSN_SOLANA_RPC_URL, json=payload)
        response.raise_for_status()
        rpc_response = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        config.logger.warning("Solana RPC unavailable for %s: %s", method, exc)
        raise HTTPException(503, "Solana RPC is unavailable while verifying TINS state") from exc
    if rpc_response.get("error"):
        message = rpc_response["error"].get("message", "unknown error")
        config.logger.warning("Solana RPC error for %s: %s", method, rpc_response["error"])
        raise HTTPException(503, f"Solana RPC rejected TINS lookup: {message}")
    return rpc_response


def get_tins_program_pubkey() -> Pubkey:
    return Pubkey.from_string(config.TINS_PROGRAM_ID)


def get_tins_identity_pda(owner_pubkey: str) -> Pubkey:
    owner_bytes = decode_base58(owner_pubkey)
    identity_seed = hashlib.sha256(owner_bytes + config.TINS_PROGRAM_SALT).digest()
    return Pubkey.find_program_address([b"identity", identity_seed], get_tins_program_pubkey())[0]


def decode_tin_account_header(data: bytes) -> dict[str, Any]:
    if len(data) < 8 + 4:
        raise ValueError("TINS account data is too short")
    offset = 0
    tin = int.from_bytes(data[offset:offset + 8], "little")
    offset += 8
    display_name_len = int.from_bytes(data[offset:offset + 4], "little")
    offset += 4
    if offset + display_name_len + 32 > len(data):
        raise ValueError("TINS account display name is invalid")
    display_name = data[offset:offset + display_name_len].decode("utf-8", errors="replace")
    offset += display_name_len
    owner_pubkey_hash = data[offset:offset + 32]
    return {
        "tin": str(tin),
        "displayName": display_name,
        "ownerPubkeyHash": owner_pubkey_hash.hex(),
    }


async def read_tins_account_data(pubkey: Pubkey) -> Optional[bytes]:
    rpc_response = await solana_rpc(
        "getAccountInfo",
        [str(pubkey), {"encoding": "base64", "commitment": "confirmed"}],
    )
    value = rpc_response.get("result", {}).get("value")
    if not value or str(value.get("owner") or "") != config.TINS_PROGRAM_ID:
        return None
    encoded = ((value.get("data") or [None])[0])
    if not encoded:
        return None
    try:
        return base64.b64decode(encoded)
    except (binascii.Error, TypeError):
        return None


async def find_tins_owner_hash_by_tin(tin: str) -> Optional[str]:
    rpc_response = await solana_rpc(
        "getProgramAccounts",
        [config.TINS_PROGRAM_ID, {"encoding": "base64", "commitment": "confirmed"}],
    )
    for account in rpc_response.get("result") or []:
        encoded = (((account.get("account") or {}).get("data") or [None])[0])
        if not encoded:
            continue
        try:
            decoded = decode_tin_account_header(base64.b64decode(encoded))
        except (ValueError, binascii.Error, TypeError):
            continue
        if str(decoded.get("tin")) == str(tin):
            return str(decoded.get("ownerPubkeyHash") or "").lower()
    return None


async def verify_onchain_tin_for_shadow_import(operation: dict[str, Any]) -> Optional[dict[str, Any]]:
    identity_pubkey = get_tins_identity_pda(str(operation["ownerPubkey"]))
    data = await read_tins_account_data(identity_pubkey)
    if not data:
        return None
    try:
        decoded = decode_tin_account_header(data)
    except ValueError:
        return None
    if decoded["tin"] != str(operation["tin"]):
        return None
    owner_pubkey_bytes = decode_base58(str(operation["ownerPubkey"]))
    expected_owner_hash = hashlib.sha256(owner_pubkey_bytes).hexdigest()
    legacy_owner_marker = owner_pubkey_bytes.hex()
    legacy_identity_marker = decode_base58(str(identity_pubkey)).hex()
    owner_pubkey_hash = str(decoded.get("ownerPubkeyHash") or "")
    if owner_pubkey_hash not in {expected_owner_hash, legacy_owner_marker, legacy_identity_marker}:
        return None
    return {
        "tin": decoded["tin"],
        "ownerPubkey": operation["ownerPubkey"],
        "identityPubkey": str(identity_pubkey),
        "ownerPubkeyHash": owner_pubkey_hash,
        "displayName": decoded["displayName"],
        "settlementAuthority": None,
        "settlementAuthorityVerified": False,
    }


async def read_private_replay_sequences() -> tuple[int, int]:
    rpc_response = await solana_rpc(
        "getAccountInfo",
        [str(get_private_replay_registry_pda()), {"encoding": "base64", "commitment": "confirmed"}],
    )
    value = rpc_response.get("result", {}).get("value")
    if not value:
        raise HTTPException(503, "TSN private replay registry is not initialized; rerun tsn:private:configure")
    encoded = ((value.get("data") or [None])[0])
    if not encoded:
        raise HTTPException(503, "TSN private replay registry data is unavailable")
    data = base64.b64decode(encoded)
    if len(data) < 57 or data[:8] != config.PRIVATE_REPLAY_REGISTRY_DISCRIMINATOR:
        raise HTTPException(503, "TSN private replay registry layout is invalid")
    return (
        int.from_bytes(data[40:48], "little"),
        int.from_bytes(data[48:56], "little"),
    )


async def read_tin_fee_config() -> dict[str, int]:
    now = time.time()
    if config._tin_fee_config_cache and config._tin_fee_config_cache_expires_at > now:
        return dict(config._tin_fee_config_cache)
    try:
        rpc_response = await solana_rpc(
            "getAccountInfo",
            [str(get_mother_escrow_pda()), {"encoding": "base64", "commitment": "confirmed"}],
        )
        value = rpc_response.get("result", {}).get("value")
        encoded = ((value.get("data") or [None])[0]) if value else None
        if encoded:
            data = base64.b64decode(encoded)
            minimum_length = 8 + 32 + 32 + 32 + 8 + 8 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 8 + 8 + 1
            if len(data) >= minimum_length:
                offset = 8 + 32 + 32 + 32 + 8 + 8 + 2 + 2 + 2
                config._tin_fee_config_cache = {
                    "verifier": int.from_bytes(data[offset:offset + 2], "little"),
                    "submitter": int.from_bytes(data[offset + 2:offset + 4], "little"),
                    "team": int.from_bytes(data[offset + 4:offset + 6], "little"),
                    "reserve_pool": int.from_bytes(data[offset + 6:offset + 8], "little"),
                }
                config._tin_fee_config_cache_expires_at = now + 60
                return dict(config._tin_fee_config_cache)
    except (httpx.HTTPError, ValueError, binascii.Error):
        pass
    config._tin_fee_config_cache = dict(config.TIN_FEE_SPLIT_BPS)
    config._tin_fee_config_cache_expires_at = now + 15
    return dict(config.TIN_FEE_SPLIT_BPS)


async def get_program_accounts(account_size: int) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            config.TSN_SOLANA_RPC_URL,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getProgramAccounts",
                "params": [
                    config.TSN_PROGRAM_ID,
                    {"encoding": "base64", "filters": [{"dataSize": account_size}]},
                ],
            },
        )
    response.raise_for_status()
    return response.json().get("result") or []


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
            "program_total_withdrawn_base_units": int.from_bytes(data[145:153], "little"),
            "program_total_rewards_base_units": int.from_bytes(data[153:161], "little"),
        })
    return results


async def read_public_vault_liquidity() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for vault in await read_onchain_cranker_vaults():
        balance_ui = 0.0
        decimals = 0
        try:
            balance_ui, decimals = await get_token_account_balance_ui(vault["vault_token_account"])
        except Exception:
            config.logger.exception("Could not read on-chain vault token balance for %s", vault["vault_token_account"])
        results.append({
            **vault,
            "total_liquidity": balance_ui,
            "total_liquidity_usd": balance_ui * float(vault.get("unit_price_usd") or 0),
            "decimals": decimals,
        })
    return results


async def read_public_vault_liquidity_cached() -> list[dict[str, Any]]:
    from .store import read_epoch_state

    state = await read_epoch_state()
    epoch_number = int(state["epoch_number"])
    now = time.monotonic()
    cached = config._vault_liquidity_cache
    if cached and cached.get("epoch_number") == epoch_number and now - float(cached.get("loaded_at", 0)) < config.VAULT_LIQUIDITY_REFRESH_SECS:
        return list(cached.get("vaults") or [])
    async with config._vault_liquidity_lock:
        now = time.monotonic()
        cached = config._vault_liquidity_cache
        if cached and cached.get("epoch_number") == epoch_number and now - float(cached.get("loaded_at", 0)) < config.VAULT_LIQUIDITY_REFRESH_SECS:
            return list(cached.get("vaults") or [])
        vaults = await read_public_vault_liquidity()
        config._vault_liquidity_cache = {"epoch_number": epoch_number, "loaded_at": now, "vaults": vaults}
        config.logger.info(
            "vault.liquidity.refreshed epoch=%s vaults=%s next_refresh_secs=%s",
            epoch_number,
            len(vaults),
            config.VAULT_LIQUIDITY_REFRESH_SECS,
        )
        return list(vaults)
