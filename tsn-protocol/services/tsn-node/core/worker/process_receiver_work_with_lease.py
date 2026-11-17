"""_process_receiver_work_with_lease: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from functools import partial
from .process_receiver_work_with_lease_keep_lease import process_receiver_work_with_lease_keep_lease
from typing import Any
import asyncio
import httpx
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    RECEIVER_NODE_LEASE_RENEW_INTERVAL: Any
    RECEIVER_NODE_WORK_TIMEOUT: Any
    _renew_receiver_node_lease: Callable[..., Any]
    _verify_and_report_receiver_work: Callable[..., Any]


async def _process_receiver_work_with_lease(node: Dependencies, client: httpx.AsyncClient, headers: dict[str, str], work: dict[str, Any]) -> None:
    # Confirm the claim before starting costly work. Renewal runs only while
    # this work is being verified/reported, never while the queue is idle.
    await node._renew_receiver_node_lease(client, headers, work)

    keep_lease = partial(process_receiver_work_with_lease_keep_lease, node, client, headers, work)

    operation = asyncio.create_task(node._verify_and_report_receiver_work(client, headers, work))
    renewal = asyncio.create_task(keep_lease())
    try:
        done, _ = await asyncio.wait({operation, renewal}, timeout=node.RECEIVER_NODE_WORK_TIMEOUT,
                                     return_when=asyncio.FIRST_COMPLETED)
        if operation in done:
            operation.result()
        elif renewal in done:
            renewal.result()
        else:
            raise TimeoutError("TSN_RECEIVER_NODE_WORK_TIMEOUT: verification exceeded its processing window")
    finally:
        # Lease loss cancels proving/reporting; normal completion cancels renewal.
        # The prover's cancellation handler terminates its child process.
        for task in (operation, renewal):
            if not task.done():
                task.cancel()
        await asyncio.gather(operation, renewal, return_exceptions=True)
