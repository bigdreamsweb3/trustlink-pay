import asyncio
from functools import partial
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch
import httpx
from core.relay.process_relay_job import process_relay_job
from .blocked_operation import blocked_operation
from .renewal_request import renewal_request


async def test_lease_loss(self):
    node = self.node
    node.job["expiresAt"] = (datetime.now(timezone.utc) + timedelta(seconds=120)).isoformat()
    node.renewals = 0
    node.operation_started = asyncio.Event()
    node.operation_cancelled = asyncio.Event()
    node.execute_relay_job = partial(blocked_operation, node)
    node.receiver_request = partial(renewal_request, node)
    with patch("core.relay.keep_relay_lease.asyncio.sleep", new=AsyncMock()):
        with self.assertRaises(httpx.HTTPStatusError):
            await process_relay_job(node, None, {}, node.job)
    self.assertTrue(node.operation_started.is_set())
    self.assertTrue(node.operation_cancelled.is_set())
    self.assertEqual(node.renewals, 2)
    self.assertEqual(node.dispatch_relay_job.await_count, 0)
