"""lifespan: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from typing import Any
import asyncio
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    EPOCH_HOURS: Any
    MEMPOOL_API_KEY: Any
    PORT: Any
    TSN_RECEIVER_NODE_API_KEY: Any
    TSN_RECEIVER_URL: Any
    TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY: Any
    TSN_THRESHOLD_NONCE_SIGNING_KEY: Any
    _node_verification_signing_key: Callable[..., Any]
    _receiver_wake_event: Any
    _receiver_funding_wake_event: Any
    _relay_wake_events: Any
    relay_worker: Callable[..., Any]
    sync_local_node: Callable[..., Any]
    _store: Any
    close_epoch_task: Callable[..., Any]
    get_store: Callable[..., Any]
    is_epoch_due: Callable[..., Any]
    logger: Any
    read_epoch_state: Callable[..., Any]
    receiver_verification_worker: Callable[..., Any]


@asynccontextmanager
async def lifespan(node: Dependencies, app: FastAPI):
    # Initialise the configured mempool store.
    await node.get_store()
    if not node.TSN_RECEIVER_NODE_API_KEY and not node.MEMPOOL_API_KEY:
        raise RuntimeError("TSN Node service credential is not configured")
    if node.TSN_RECEIVER_URL and node.TSN_RECEIVER_NODE_API_KEY:
        try:
            node._node_verification_signing_key()
        except RuntimeError as exc:
            raise RuntimeError(
                "TSN Node verification signing key is required when the Receiver worker is enabled"
            ) from exc
    if not node.TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY:
        node.logger.warning("TSN settlement authorization signing is disabled until its signing key is configured")
    if not node.TSN_THRESHOLD_NONCE_SIGNING_KEY:
        node.logger.warning(
            "TIN threshold key access is disabled until TSN_THRESHOLD_NONCE_SIGNING_KEY is configured"
        )
    if node.is_epoch_due(await node.read_epoch_state()):
        node.logger.info("Epoch was overdue on startup; closing before accepting work")
        try:
            result = await node.close_epoch_task()
            node.logger.info("Startup epoch close completed: %s", result.message)
        except Exception:
            node.logger.exception("Startup epoch close failed; live work remains available")
    pass  # Mutable state belongs to the explicit Node runtime.
    node._receiver_wake_event = asyncio.Event()
    node._receiver_funding_wake_event = asyncio.Event()
    # Process work that arrived while the Node was offline, then sleep again.
    node._receiver_wake_event.set()
    node._receiver_funding_wake_event.set()
    node._relay_wake_events = {lane: asyncio.Event() for lane in ("FUNDING", "SIGNING", "PUBLIC")}
    for wake in node._relay_wake_events.values():
        wake.set()
    # Durable outbound synchronization observes Receiver revisions and wakes local lanes.
    tasks: list[asyncio.Task[Any]] = []
    if node.TSN_RECEIVER_URL and node.TSN_RECEIVER_NODE_API_KEY:
        tasks.append(asyncio.create_task(node.receiver_verification_worker()))
        tasks.append(asyncio.create_task(node.receiver_verification_worker(signed_funding_only=True)))
        tasks.append(asyncio.create_task(node.sync_local_node()))
        for lane in node._relay_wake_events:
            tasks.append(asyncio.create_task(node.relay_worker(lane)))
    node.logger.info("TSN Node started on port %d (epoch every %dh)", node.PORT, node.EPOCH_HOURS)
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if node._store:
            await node._store.aclose()
