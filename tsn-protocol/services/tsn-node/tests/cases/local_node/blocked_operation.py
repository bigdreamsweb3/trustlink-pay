"""Synthetic pending operation for lease-loss cancellation, with no signing or network work."""
import asyncio


async def blocked_operation(node, job):
    node.operation_started.set()
    try:
        await asyncio.Event().wait()
    finally:
        node.operation_cancelled.set()
