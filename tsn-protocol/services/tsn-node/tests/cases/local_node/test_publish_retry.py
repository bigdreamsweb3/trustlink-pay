from functools import partial
from unittest.mock import AsyncMock, patch
from core.relay.publish_relay_reply import publish_relay_reply
from storage.cache.cache_path import cache_path
from .publish_request import publish_request


async def test_publish_retry(self):
    node = self.node
    node.reports = []
    node.receiver_request = partial(publish_request, node)
    with patch("core.relay.publish_relay_reply.asyncio.sleep", new=AsyncMock()):
        await publish_relay_reply(node, None, {}, node.job)
    self.assertEqual(node.dispatch_relay_job.await_count, 1)
    self.assertEqual(len(node.reports), 2)
    self.assertEqual(node.reports[0], node.reports[1])
    self.assertFalse(cache_path(node, node.job["id"]).exists())
