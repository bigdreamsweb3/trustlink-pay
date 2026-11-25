"""Checkpoint execution intent before calling a handler; bounded cache pressure stops new operations."""
from .cache_path import cache_path
from .atomic_cache_json import atomic_cache_json


from .dependencies import CacheDependencies

def reserve_local_reply(node: CacheDependencies, job: dict) -> None:
    path = cache_path(node, job["id"])
    if path.exists():
        raise ValueError("NODE_RELAY_OUTCOME_UNKNOWN")
    if sum(1 for item in path.parent.glob("*.json") if len(item.stem) == 64) >= 128:
        raise ValueError("NODE_CACHE_FULL")
    atomic_cache_json(path, {"version": 1, "requestHash": job["requestHash"], "reserved": True})
