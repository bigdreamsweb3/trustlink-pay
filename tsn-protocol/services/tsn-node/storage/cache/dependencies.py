"""Explicit local cache ports; caches have no database or execution permission."""
import asyncio
from pathlib import Path
from typing import Callable, Protocol, Any

class CacheDependencies(Protocol):
    LOCAL_NODE_CACHE_DIR: Path
    TSN_RECEIVER_URL: str
    _node_verification_signing_key: Callable[[], Any]
    _local_cache_lock: asyncio.Lock
    logger: Any
