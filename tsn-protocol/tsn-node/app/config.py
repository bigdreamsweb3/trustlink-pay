from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger("tsn-node")
MEMPOOL_NS = "tsn"
MEMPOOL_STORE = os.environ.get("MEMPOOL_STORE", "receiver").strip().lower()
MEMPOOL_FILE = Path(os.environ.get("MEMPOOL_FILE", ".tsn-node-test-store.json")).resolve()
ALLOW_LOCAL_JSON_STORE = os.environ.get("TSN_ALLOW_LOCAL_JSON_STORE", "").lower() == "true"
ALLOW_DIRECT_FIREBASE_STORE = os.environ.get("TSN_ALLOW_DIRECT_FIREBASE_STORE", "").lower() == "true"
FIREBASE_COLLECTION = os.environ.get("FIREBASE_COLLECTION", "tsn_node_state")
TSN_RECEIVER_URL = os.environ.get(
    "TSN_RECEIVER_URL",
    "https://tsn-receiver-kappa.vercel.app",
).strip()
TSN_RECEIVER_NODE_API_KEY = os.environ.get("TSN_RECEIVER_NODE_API_KEY", "").strip()
_store = None
