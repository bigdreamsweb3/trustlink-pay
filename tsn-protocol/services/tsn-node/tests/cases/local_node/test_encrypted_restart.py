import json
from core.relay.execute_relay_job import execute_relay_job
from storage.cache.cache_path import cache_path


async def test_encrypted_restart(self):
    node = self.node
    first = await execute_relay_job(node, node.job)
    self.assertEqual(first["status"], 200)
    self.assertEqual(json.loads(first["body"])["result"], "synthetic-private-value")
    text = cache_path(node, node.job["id"]).read_text(encoding="utf8")
    self.assertNotIn("synthetic-private-value", text)
    self.assertNotIn("synthetic-owner-approval", text)
    later = {**node.job, "version": 3}
    self.assertEqual(await execute_relay_job(node, later), first)
    self.assertEqual(node.dispatch_relay_job.await_count, 1)
