from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger("tsn-node")


def clean_env(value: str | None, default: str = "") -> str:
    return (value if value is not None else default).strip().strip('"').strip("'").strip()
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
    os.environ.get("TSN_RPC_GATEWAY_URL"),
    "https://tsn-rpc-gateway.vercel.app",
).rstrip("/")
# Compatibility name for internal helpers; it always points to the same
# single TrustLink RPC gateway and is not independently configurable.
TSN_SOLANA_RPC_URL = TSN_RPC_GATEWAY_URL
_store = None
