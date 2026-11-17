from __future__ import annotations

from pathlib import Path
from .clean_env import clean_env
import hashlib
from .load_local_env import load_local_env
import logging
import os

logger = logging.getLogger("tsn-node")

load_local_env()

MEMPOOL_NS = "tsn"

MEMPOOL_STORE = os.environ.get("MEMPOOL_STORE", "receiver").strip().lower()

MEMPOOL_FILE = Path(os.environ.get("MEMPOOL_FILE", ".tsn-node-test-store.json")).resolve()

ALLOW_LOCAL_JSON_STORE = os.environ.get("TSN_ALLOW_LOCAL_JSON_STORE", "").lower() == "true"

ALLOW_DIRECT_FIREBASE_STORE = os.environ.get("TSN_ALLOW_DIRECT_FIREBASE_STORE", "").lower() == "true"

FIREBASE_COLLECTION = os.environ.get("FIREBASE_COLLECTION", "tsn_node_state")

TSN_RECEIVER_URL = clean_env(os.environ.get(
    "TSN_RECEIVER_URL",
    "https://tsn-receiver-kappa.vercel.app",
))

TSN_RECEIVER_FALLBACK_URL = clean_env(os.environ.get(
    "TSN_RECEIVER_FALLBACK_URL",
    "https://tsn-receiver-kappa.vercel.app",
))

TSN_RECEIVER_NODE_API_KEY = clean_env(os.environ.get("TSN_RECEIVER_NODE_API_KEY"))

TSN_RPC_GATEWAY_URL = clean_env(
    os.environ.get("TSN_RPC_URL") or os.environ.get("TSN_RPC_GATEWAY_URL"),
    "https://tsn-rpc-gateway.vercel.app",
).rstrip("/")

TSN_SOLANA_RPC_URL = TSN_RPC_GATEWAY_URL

CRANKER_VAULT_ACCOUNT_SIZE = 178

CRANKER_VAULT_DISCRIMINATOR = hashlib.sha256(b"account:CrankerVault").digest()[:8]

_store = None
