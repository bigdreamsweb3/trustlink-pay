import asyncio
from core.worker.receiver_verification_worker import receiver_verification_worker
from .make_ports import make_ports


async def test_cancellation(self):
    node = make_ports(failure=asyncio.CancelledError())
    node._receiver_wake_event.set()
    with self.assertRaises(asyncio.CancelledError):
        await receiver_verification_worker(node)
    self.assertEqual(len(node.requests), 1)
    self.assertNotIn("coordinate", node.events)
    self.assertEqual(node.logger.exception.call_count, 0)
