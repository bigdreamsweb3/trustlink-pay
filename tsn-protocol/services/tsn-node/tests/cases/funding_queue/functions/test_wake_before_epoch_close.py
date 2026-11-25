import asyncio
from functools import partial
from unittest.mock import AsyncMock, Mock
from api.handlers.wake_receiver_verification import wake_receiver_verification
from .close_slow_epoch import close_slow_epoch
from .make_ports import make_ports


async def test_wake_before_epoch_close(self):
    node = make_ports()
    node.read_epoch_state = AsyncMock(return_value={})
    node.is_epoch_due = Mock(return_value=True)
    node.close_epoch_task = partial(close_slow_epoch, node)
    wake = asyncio.create_task(wake_receiver_verification(node))
    try:
        await asyncio.wait_for(node.expensive_started.wait(), timeout=2)
        self.assertTrue(node._receiver_wake_event.is_set())
        self.assertTrue(node._receiver_funding_wake_event.is_set())
        self.assertFalse(wake.done())
        node.release_expensive.set()
        self.assertEqual(await wake, {"ok": True, "status": "awake"})
    finally:
        wake.cancel()
        await asyncio.gather(wake, return_exceptions=True)
