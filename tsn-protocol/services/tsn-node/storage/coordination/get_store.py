"""get_store: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    ReceiverStore: Callable[..., Any]
    FileStore: Callable[..., Any]
    ALLOW_LOCAL_JSON_STORE: Any
    MEMPOOL_FILE: Any
    MEMPOOL_STORE: Any
    TSN_RECEIVER_FALLBACK_URL: Any
    TSN_RECEIVER_NODE_API_KEY: Any
    TSN_RECEIVER_URL: Any
    _store: Any
    logger: Any


async def get_store(node: Dependencies) -> Any:
    pass  # Mutable state belongs to the explicit Node runtime.
    if node._store is None:
        if node.TSN_RECEIVER_URL:
            node._store = node.ReceiverStore(node.TSN_RECEIVER_URL, node.TSN_RECEIVER_NODE_API_KEY, node.TSN_RECEIVER_FALLBACK_URL)
            node.logger.info("TSN Node durable state is delegated to Receiver: %s", node.TSN_RECEIVER_URL)
        elif node.MEMPOOL_STORE in {"file", "local", "json"} and node.ALLOW_LOCAL_JSON_STORE:
            node._store = node.FileStore(node.MEMPOOL_FILE)
            node.logger.warning("Using explicitly enabled local-only TSN JSON store: %s", node.MEMPOOL_FILE)
        else:
            raise RuntimeError(
                "TSN Node durable state requires TSN_RECEIVER_URL and TSN_RECEIVER_NODE_API_KEY. "
                "Local JSON is an isolated-test adapter only."
            )
    return node._store
