import json
from core.relay.execute_relay_job import execute_relay_job


async def test_unknown_execution(self):
    node = self.node
    node.dispatch_relay_job.side_effect = RuntimeError("synthetic interrupted execution")
    with self.assertRaises(RuntimeError):
        await execute_relay_job(node, node.job)
    reply = await execute_relay_job(node, {**node.job, "version": 3})
    self.assertEqual(reply["status"], 409)
    self.assertEqual(json.loads(reply["body"]), {"error": "NODE_RELAY_OUTCOME_UNKNOWN"})
    self.assertEqual(node.dispatch_relay_job.await_count, 1)
