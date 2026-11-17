import asyncio
from unittest.mock import patch
from server import runtime as server

async def test_processing_timeout_cancels_verification_and_renewal(self):
    with patch.object(server, 'RECEIVER_NODE_WORK_TIMEOUT', 0.03):
        with self.assertRaisesRegex(TimeoutError, 'WORK_TIMEOUT'):
            await self.process(self.never_finishes)
    self.assertTrue(self.cancelled.is_set())
    count = len(self.calls)
    await asyncio.sleep(0.02)
    self.assertEqual(len(self.calls), count)
    self.assertFalse(any((method == 'PATCH' for method, _, _ in self.calls)))
