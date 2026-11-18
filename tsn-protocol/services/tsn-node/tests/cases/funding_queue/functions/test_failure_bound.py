from unittest.mock import AsyncMock, patch
from .make_ports import make_ports
from .run_cycle import run_cycle


async def test_failure_bound(self):
    node = make_ports(failure=RuntimeError("SYNTHETIC_CLAIM_UNAVAILABLE"))
    with patch("core.worker.receiver_verification_worker.asyncio.sleep", new=AsyncMock()) as sleep:
        await run_cycle(node)
    self.assertEqual(len(node.requests), 6)
    self.assertEqual(sleep.await_count, 5)
    self.assertNotIn("coordinate", node.events)
    self.assertEqual(node.processed, [])
