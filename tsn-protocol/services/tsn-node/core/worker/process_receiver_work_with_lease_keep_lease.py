"""process_receiver_work_with_lease_keep_lease: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from typing import Any
import asyncio
import httpx
from typing import Any, Protocol
class Dependencies(Protocol):
    RECEIVER_NODE_LEASE_RENEW_INTERVAL: Any
    RECEIVER_NODE_WORK_TIMEOUT: Any
    _renew_receiver_node_lease: Any
    _verify_and_report_receiver_work: Any

async def process_receiver_work_with_lease_keep_lease(node, client, headers, work):
    while True:
        await asyncio.sleep(node.RECEIVER_NODE_LEASE_RENEW_INTERVAL)
        await node._renew_receiver_node_lease(client, headers, work)
