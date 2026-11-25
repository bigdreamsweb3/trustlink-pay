import json
from core.relay.execute_relay_job import execute_relay_job
from storage.cache.cache_path import cache_path


async def test_cache_corruption(self):
    node = self.node
    await execute_relay_job(node, node.job)
    path = cache_path(node, node.job["id"])
    saved = json.loads(path.read_text(encoding="utf8"))
    saved["ciphertext"] = "AA=="
    path.write_text(json.dumps(saved), encoding="utf8")
    reply = await execute_relay_job(node, node.job)
    self.assertEqual(json.loads(reply["body"]), {"error": "NODE_CACHE_INVALID"})
    self.assertEqual(node.dispatch_relay_job.await_count, 1)
