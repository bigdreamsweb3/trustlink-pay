from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from solders.pubkey import Pubkey

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("tsn-mempool")

GITHUB_REPO = "bigdreamsweb3/tsn-epoch-records"
GITHUB_API = "https://api.github.com"
MEMPOOL_STORE = os.environ.get("MEMPOOL_STORE", "file").strip().lower()
MEMPOOL_FILE = Path(os.environ.get("MEMPOOL_FILE", ".mempool-store.json")).resolve()
FIREBASE_COLLECTION = os.environ.get("FIREBASE_COLLECTION", "tsn_mempool").strip()
TSN_PROGRAM_ID = os.environ.get("TSN_PROGRAM_ID") or os.environ.get("PROGRAM_ID") or "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
TINS_PROGRAM_ID = os.environ.get("TINS_PROGRAM_ID", "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT")
TINS_PROGRAM_SALT = b"TINS_SALT_2026"
MEMPOOL_API_KEY = os.environ.get("MEMPOOL_API_KEY", "").strip()
TSN_ROUTE_ENCRYPTION_SECRET_KEY = (
    os.environ.get("TSN_ROUTE_ENCRYPTION_SECRET_KEY")
    or os.environ.get("TSN_CRANKER_ENCRYPTION_SECRET_KEY")
    or ""
).strip()
TSN_PERMIT_SIGNER_SECRET_KEY = os.environ.get("TSN_PERMIT_SIGNER_SECRET_KEY", "").strip()
EPOCH_HOURS = int(os.environ.get("EPOCH_HOURS", "7"))
EPOCH_SECS = EPOCH_HOURS * 60 * 60
VAULT_LIQUIDITY_REFRESH_SECS = max(60, int(os.environ.get("VAULT_LIQUIDITY_REFRESH_SECS", str(EPOCH_SECS))))
PORT = int(os.environ.get("PORT", "8000"))
MEMPOOL_NS = "tsn"
CLAIM_PROCESSING_TIMEOUT_SECS = int(os.environ.get("CLAIM_PROCESSING_TIMEOUT_SECS", "300"))
RECOVERY_LEASE_SECS = int(os.environ.get("RECOVERY_LEASE_SECS", "300"))
RECOVERY_REWARD_LAMPORTS = int(os.environ.get("RECOVERY_REWARD_LAMPORTS", "10000"))
RECOVERY_LOW_LIQUIDITY_UI = float(os.environ.get("RECOVERY_LOW_LIQUIDITY_UI", "0"))
CRANKER_HEARTBEAT_TTL_SECS = int(os.environ.get("CRANKER_HEARTBEAT_TTL_SECS", "30"))
DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
CRANKER_VAULT_ACCOUNT_SIZE = 162
CRANKER_VAULT_DISCRIMINATOR = hashlib.sha256(b"account:CrankerVault").digest()[:8]
BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
PRIVATE_PAYOUT_DOMAIN = b"TSN_PRIVATE_PAYOUT_V2"
PRIVATE_RECOVERY_DOMAIN = b"TSN_PRIVATE_RECOVERY_V2"
PRIVATE_REPLAY_REGISTRY_DISCRIMINATOR = hashlib.sha256(
    b"account:PrivateReplayRegistry"
).digest()[:8]
MEMPOOL_LEASE_DOMAIN = "TSN_MEMPOOL_LEASE_V1"
PERMIT_TTL_SECS = max(15, int(os.environ.get("TSN_PRIVATE_PERMIT_TTL_SECS", "90")))
LEASE_AUTH_MAX_AGE_SECS = max(15, int(os.environ.get("TSN_LEASE_AUTH_MAX_AGE_SECS", "60")))

TERMINAL_INTENT_STATUSES = {
    "executed",
    "settled",
    "completed",
    "failed",
    "canceled",
    "cancelled",
    "expired",
    "reverted",
}
TERMINAL_CLAIM_STATUSES = {
    "completed",
    "failed",
    "canceled",
    "cancelled",
    "expired",
}
TIN_OPERATION_STATUSES = {
    "pending_verification",
    "verifier_assigned",
    "verified",
    "fee_pending",
    "fee_committed",
    "submitter_assigned",
    "submitted_onchain",
    "finalized",
    "rejected",
    "expired",
    "failed",
}
TIN_OPERATION_TERMINAL_STATUSES = {"finalized", "rejected", "expired", "failed"}
TIN_DEFAULT_FEE_MINT = DEVNET_USDC_MINT
TIN_DEFAULT_PRU_COUNT = 30
TIN_CREATION_FEE_USDC = "0.05"
TIN_UPDATE_FEE_USDC = "0.01"
TIN_FEE_SPLIT_BPS = {
    "verifier": 3000,
    "submitter": 4000,
    "team": 2000,
    "reserve_pool": 1000,
}
TIN_OWNER_INTENT_CREATE_DOMAIN_V1 = "TIN_OWNER_INTENT_CREATE_V1"
TIN_OWNER_INTENT_UPDATE_DOMAIN_V1 = "TIN_OWNER_INTENT_UPDATE_V1"
TIN_OWNER_INTENT_CREATE_DOMAIN_V2 = "TSN_TIN_OWNER_INTENT_CREATE_V2"
TIN_OWNER_INTENT_UPDATE_DOMAIN_V2 = "TSN_TIN_OWNER_INTENT_UPDATE_V2"
TIN_PRIVATE_METADATA_DOMAIN_V1 = "TSN_TIN_PRIVATE_METADATA_V1"
TIN_PRU_CONFIGURATION_TAG = "TSN_TIN_PRU_CONFIGURATION_V1"

_vault_liquidity_cache: Optional[dict[str, Any]] = None
_vault_liquidity_lock = asyncio.Lock()
_claim_queue_lock = asyncio.Lock()
_recovery_queue_lock = asyncio.Lock()
_tin_operation_lock = asyncio.Lock()
_tin_fee_config_cache: Optional[dict[str, Any]] = None
_tin_fee_config_cache_expires_at = 0.0
_store: Optional[Any] = None


def split_rpc_url_list(value: str) -> list[str]:
    return [entry.strip().rstrip("/") for entry in re.split(r"[,\s]+", value) if entry.strip()]


def resolve_solana_rpc_url() -> str:
    urls = split_rpc_url_list(os.environ.get("TSN_SOLANA_RPC_URLS", ""))
    return urls[0] if urls else "https://api.devnet.solana.com"


TSN_SOLANA_RPC_URL = resolve_solana_rpc_url()


def get_supported_token_mints() -> set[str]:
    raw = os.environ.get("SOLANA_ALLOWED_SPL_TOKENS", "").strip()
    if not raw:
        return {DEVNET_USDC_MINT}
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return {DEVNET_USDC_MINT}
        mints = {
            str(token.get("mintAddress", "")).strip()
            for token in parsed
            if isinstance(token, dict) and str(token.get("mintAddress", "")).strip()
        }
        return mints or {DEVNET_USDC_MINT}
    except json.JSONDecodeError:
        logger.warning("SOLANA_ALLOWED_SPL_TOKENS was invalid JSON; using devnet USDC only")
        return {DEVNET_USDC_MINT}


def parse_optional_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def get_supported_token_metadata() -> dict[str, dict[str, Any]]:
    raw = os.environ.get("SOLANA_ALLOWED_SPL_TOKENS", "").strip()
    default = {
        DEVNET_USDC_MINT: {
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
    metadata: dict[str, dict[str, Any]] = {}
    for token in parsed:
        if not isinstance(token, dict):
            continue
        mint = str(token.get("mintAddress", "")).strip()
        if not mint:
            continue
        unit_price_usd = parse_optional_float(
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
