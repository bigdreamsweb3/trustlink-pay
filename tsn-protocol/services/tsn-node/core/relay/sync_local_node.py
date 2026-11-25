"""Observe a durable cursor over outbound HTTPS; keep missed notifications recoverable without copying the queue."""
import asyncio
import json
import time
from pathlib import Path
import httpx
from storage.cache.atomic_cache_json import atomic_cache_json


from .dependencies import RelayDependencies

async def sync_local_node(node: RelayDependencies) -> None:
    path = Path(node.LOCAL_NODE_CACHE_DIR) / "sync-state.json"
    epoch, cursor = "", 0
    if path.exists():
        try:
            saved = json.loads(await asyncio.to_thread(path.read_text, encoding="utf8"))
            if (isinstance(saved, dict) and saved.get("source") == node.TSN_RECEIVER_URL
                    and isinstance(saved.get("epoch"), str) and len(saved["epoch"]) <= 64
                    and type(saved.get("cursor")) is int and 0 <= saved["cursor"] <= 9007199254740991):
                epoch, cursor = saved["epoch"], saved["cursor"]
        except (OSError, ValueError, TypeError):
            node.logger.warning("Local synchronization cursor is unreadable; refreshing from Receiver")
    last_safety_drain = 0.0
    delay = 2.0
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            try:
                response = await node.receiver_request(client, "GET", "/api/internal/node/relay",
                    headers={"x-api-key": node.TSN_RECEIVER_NODE_API_KEY}, params={"epoch": epoch, "cursor": cursor})
                response.raise_for_status()
                state = response.json()
                if (type(state.get("cursor")) is not int or state["cursor"] < 0 or not isinstance(state.get("epoch"), str)
                        or len(state["epoch"]) > 64 or type(state.get("retryAfterMs")) is not int or not 0 <= state["retryAfterMs"] <= 15000):
                    raise ValueError("NODE_RELAY_CURSOR_INVALID")
                changed = state["epoch"] != epoch or state["cursor"] != cursor
                if changed or time.monotonic() - last_safety_drain >= 60:
                    node._receiver_wake_event.set()
                    node._receiver_funding_wake_event.set()
                    for wake in node._relay_wake_events.values():
                        wake.set()
                    last_safety_drain = time.monotonic()
                epoch, cursor = state["epoch"], state["cursor"]
                async with node._local_cache_lock:
                    await asyncio.to_thread(atomic_cache_json, path, {"version": 1, "source": node.TSN_RECEIVER_URL, "epoch": epoch, "cursor": cursor})
                delay = 2.0
                if state["retryAfterMs"]:
                    await asyncio.sleep(state["retryAfterMs"] / 1000)
            except asyncio.CancelledError:
                raise
            except Exception:
                node.logger.warning("Local Node synchronization unavailable; retrying in %ds", delay)
                await asyncio.sleep(delay)
                delay = min(30.0, delay * 2)
