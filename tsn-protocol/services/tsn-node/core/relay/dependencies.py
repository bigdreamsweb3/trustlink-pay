"""The relay's narrow application, cache and authenticated Receiver ports."""
import asyncio
from typing import Any, Callable, Protocol
from storage.cache.dependencies import CacheDependencies

class RelayDependencies(CacheDependencies, Protocol):
    TSN_NODE_ID: str
    TSN_RECEIVER_NODE_API_KEY: str
    _relay_app: Any
    _relay_wake_events: dict[str, asyncio.Event]
    _receiver_wake_event: asyncio.Event
    _receiver_funding_wake_event: asyncio.Event
    logger: Any
    receiver_request: Callable[..., Any]
    dispatch_relay_job: Callable[..., Any]
    execute_relay_job: Callable[..., Any]
