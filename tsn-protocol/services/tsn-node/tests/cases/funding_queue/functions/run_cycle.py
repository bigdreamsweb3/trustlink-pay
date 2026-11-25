import asyncio
from core.worker.receiver_verification_worker import receiver_verification_worker


async def run_cycle(node, *, signed_funding_only=False):
    task = asyncio.create_task(receiver_verification_worker(node, signed_funding_only=signed_funding_only))
    (node._receiver_funding_wake_event if signed_funding_only else node._receiver_wake_event).set()
    try:
        await asyncio.wait_for(node.settled.wait(), timeout=2)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
