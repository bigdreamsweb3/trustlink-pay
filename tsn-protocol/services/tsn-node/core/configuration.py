from __future__ import annotations
import asyncio
import hashlib
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from dotenv import load_dotenv
from app.solana_pubkey import Pubkey
from core.environment.clean_env import clean_env

_node_root = Path(__file__).resolve().parents[1]
NODE_ROOT = _node_root
load_dotenv(_node_root / ".env.local", override=False)
load_dotenv(_node_root / ".env", override=False)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)

logger = logging.getLogger("tsn-mempool")

GITHUB_REPO     = "bigdreamsweb3/tsn-epoch-records"

GITHUB_API      = "https://api.github.com"

MEMPOOL_STORE   = os.environ.get("MEMPOOL_STORE", "receiver").strip().lower()

ALLOW_LOCAL_JSON_STORE = os.environ.get("TSN_ALLOW_LOCAL_JSON_STORE", "").strip().lower() == "true"

TSN_RECEIVER_URL = clean_env(os.environ.get(
    "TSN_RECEIVER_URL",
    "https://tsn-receiver-kappa.vercel.app",
))

TSN_RECEIVER_FALLBACK_URL = clean_env(os.environ.get(
    "TSN_RECEIVER_FALLBACK_URL",
    "https://tsn-receiver-kappa.vercel.app",
))

TSN_RECEIVER_NODE_API_KEY = clean_env(os.environ.get("TSN_RECEIVER_NODE_API_KEY"))

TSN_MOTHER_AUTHORITY_KEYPAIR_PATH = clean_env(os.environ.get("TSN_MOTHER_AUTHORITY_KEYPAIR_PATH"))

TSN_NODE_ID = clean_env(os.environ.get("TSN_NODE_ID", "tsn-node-local"))

TSN_NODE_VERIFICATION_SIGNING_KEY = clean_env(os.environ.get("TSN_NODE_VERIFICATION_SIGNING_KEY"))

TSN_LOCAL_FLOW_LOGS = os.environ.get("TSN_LOCAL_FLOW_LOGS", "").strip().lower() in {"1", "true", "yes", "on"} or TSN_NODE_ID == "tsn-node-local"


MEMPOOL_FILE    = Path(os.environ.get("MEMPOOL_FILE", ".mempool-store.json")).resolve()


TSN_PROGRAM_ID  = os.environ.get("TSN_PROGRAM_ID") or os.environ.get("PROGRAM_ID") or "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"

TINS_PROGRAM_ID = os.environ.get("TINS_PROGRAM_ID", "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT")

TCAP_PROGRAM_ID = os.environ.get("TCAP_PROGRAM_ID", "tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF")

GPRU_PROGRAM_ID = os.environ.get("GPRU_PROGRAM_ID", "6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR")

TINS_PROGRAM_SALT = b"TINS_SALT_2026"

TINS_LOOKUP_SECRET = clean_env(os.environ.get("TINS_LOOKUP_SECRET"))

MEMPOOL_API_KEY  = os.environ.get("MEMPOOL_API_KEY", "").strip()

TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY = os.environ.get(
    "TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY", ""
).strip()

TSN_THRESHOLD_NONCE_SIGNING_KEY = os.environ.get(
    "TSN_THRESHOLD_NONCE_SIGNING_KEY",
    "",
).strip()

TSN_ROUTE_ATTESTATION_SIGNING_KEY = os.environ.get(
    "TSN_ROUTE_ATTESTATION_SIGNING_KEY",
    "",
).strip()

EPOCH_HOURS     = int(os.environ.get("EPOCH_HOURS", "7"))

EPOCH_SECS      = EPOCH_HOURS * 60 * 60

VAULT_LIQUIDITY_REFRESH_SECS = max(60, int(os.environ.get("VAULT_LIQUIDITY_REFRESH_SECS", str(EPOCH_SECS))))

HOST            = "127.0.0.1"
LOCAL_NODE_CACHE_DIR = Path(os.environ.get("TSN_NODE_CACHE_DIR", str(NODE_ROOT / ".node-cache")))
if not LOCAL_NODE_CACHE_DIR.is_absolute():
    LOCAL_NODE_CACHE_DIR = NODE_ROOT / LOCAL_NODE_CACHE_DIR

PORT            = int(os.environ.get("PORT", "8000"))

MEMPOOL_NS      = "tsn"

CRANKER_HEARTBEAT_TTL_SECS = int(os.environ.get("CRANKER_HEARTBEAT_TTL_SECS", "30"))

DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"

CRANKER_VAULT_ACCOUNT_SIZE = 178

CRANKER_VAULT_DISCRIMINATOR = hashlib.sha256(b"account:CrankerVault").digest()[:8]

BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

TSN_RPC_GATEWAY_URL = clean_env(
    os.environ.get("TSN_RPC_URL") or os.environ.get("TSN_RPC_GATEWAY_URL"),
    "https://tsn-rpc-gateway.vercel.app",
).rstrip("/")

TSN_SOLANA_RPC_URLS = list(dict.fromkeys((
    TSN_RPC_GATEWAY_URL,
    "https://api.devnet.solana.com",
)))

TSN_SOLANA_RPC_URL = TSN_SOLANA_RPC_URLS[0]

TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")

TOKEN_2022_PROGRAM_ID = Pubkey.from_string("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")

ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")

PRIVATE_PAYOUT_DOMAIN = b"TSN_PRIVATE_SLOT_SETTLEMENT_V1"

PRIVATE_REFUND_DOMAIN = b"TSN_PRIVATE_SLOT_REFUND_V1"

MEMPOOL_LEASE_DOMAIN = "TSN_MEMPOOL_LEASE_V1"

PERMIT_TTL_SECS = max(15, int(os.environ.get("TSN_PRIVATE_PERMIT_TTL_SECS", "90")))

TSN_NODE_CLAIM_SLOT_HMAC_SECRET = os.environ.get("TSN_NODE_CLAIM_SLOT_HMAC_SECRET", "").strip()

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

SERVICE_STARTED_AT = datetime.now(timezone.utc)

TSN_CANONICAL_DOMAIN_DISPLAY = "..." + hashlib.sha256(
    b"trustlink-pay:tsn:canonical-signing:v1"
).hexdigest()[-8:]

TCAP_PROOF_FIELDS = {"publicInputs", "proofA", "proofB", "proofC", "actionKind", "tokenId", "amountCommitment", "authorizationCommitment"}

TCAP_CRANKER_TRANSITION_FIELDS = {
    "commitmentRoot", "previousTcapRoot", "tcapRootSequence", "tokenId", "amountCommitment", "nullifier", "fundingRootAccount", "accountingEpoch",
    "validAfterSlot", "expiresAtSlot", "authorizationDigest", "proof", "memoPayload", "memoBodyPayload",
    "memoLedgerSlots", "memoDocument", "memoCommitment", "successorBalancePoint", "assetEntry", "tcapConfig", "reserveState",
}

SOLANA_V1_TRANSACTION_SIZE_LIMIT = 4096

RECEIVER_NODE_LEASE_RENEW_INTERVAL = 15.0

RECEIVER_NODE_WORK_TIMEOUT = 600.0
