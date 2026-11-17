from __future__ import annotations

from typing import Any
from app.receiver_store import ReceiverStore
from app import config

async def get_store() -> Any:
    from .types import FileStore, FirebaseStore
    if config._store is None:
        if config.TSN_RECEIVER_URL:
            config._store = ReceiverStore(
                config.TSN_RECEIVER_URL,
                config.TSN_RECEIVER_NODE_API_KEY,
                config.TSN_RECEIVER_FALLBACK_URL,
            )
        elif config.MEMPOOL_STORE == "firebase" and config.ALLOW_DIRECT_FIREBASE_STORE:
            config._store = FirebaseStore()
        elif config.MEMPOOL_STORE in {"file", "local", "json"} and config.ALLOW_LOCAL_JSON_STORE:
            config._store = FileStore()
            config.logger.warning("Using explicitly enabled local-only TSN JSON store: %s", config.MEMPOOL_FILE)
        else:
            raise RuntimeError(
                "TSN Node durable state requires TSN_RECEIVER_URL and TSN_RECEIVER_NODE_API_KEY. "
                "Direct Firebase and local JSON are isolated-test adapters only."
            )
    return config._store
