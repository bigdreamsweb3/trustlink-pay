"""A corrupt local hint never disables authoritative outbound synchronization."""
import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch
import httpx
from core.relay.sync_local_node import sync_local_node


async def test_cursor_recovery(self):
    target = Path(self.node.LOCAL_NODE_CACHE_DIR) / "sync-state.json"
    target.write_text("corrupt cursor", encoding="utf8")
    self.node._receiver_wake_event = asyncio.Event()
    self.node._receiver_funding_wake_event = asyncio.Event()
    self.node._relay_wake_events = {lane: asyncio.Event() for lane in ("FUNDING", "SIGNING", "PUBLIC")}
    response = httpx.Response(200, json={"epoch": "receiver-epoch", "cursor": 7, "retryAfterMs": 0}, request=httpx.Request("GET", "https://receiver.invalid"))
    self.node.receiver_request = AsyncMock(side_effect=[response, asyncio.CancelledError()])
    with self.assertRaises(asyncio.CancelledError):
        await sync_local_node(self.node)
    self.assertEqual(self.node.receiver_request.call_args_list[0].kwargs["params"], {"epoch": "", "cursor": 0})
    self.assertEqual(json.loads(target.read_text(encoding="utf8"))["cursor"], 7)
    self.assertTrue(self.node._receiver_wake_event.is_set())
    self.assertTrue(self.node._receiver_funding_wake_event.is_set())
    self.assertTrue(all(event.is_set() for event in self.node._relay_wake_events.values()))
