import asyncio
from core.worker.receiver_verification_worker import receiver_verification_worker
from .make_ports import make_ports


async def test_idle_wake(self):
    node = make_ports()
    task = asyncio.create_task(receiver_verification_worker(node))
    try:
        await asyncio.wait_for(node.idle.wait(), timeout=2)
        self.assertEqual(node.requests, [])
        node._receiver_wake_event.set()
        await asyncio.wait_for(node.settled.wait(), timeout=2)
        self.assertEqual(len(node.requests), 2)
        self.assertFalse(node._receiver_wake_event.is_set())
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
