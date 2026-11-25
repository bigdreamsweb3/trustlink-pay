import copy
from core.relay.execute_relay_job import execute_relay_job
from core.relay.validate_relay_job import validate_relay_job
from storage.cache.cache_path import cache_path


async def test_hash_and_path_validation(self):
    for field, value in [("id", "../outside"), ("requestHash", "00" * 32)]:
        changed = {**self.node.job, field: value}
        with self.assertRaises(ValueError):
            await execute_relay_job(self.node, changed)
    changed = copy.deepcopy(self.node.job)
    changed["request"]["path"] = "https://attacker.invalid/execute"
    with self.assertRaises(ValueError):
        validate_relay_job(changed)
    with self.assertRaises(ValueError):
        cache_path(self.node, "../../outside")
    self.assertEqual(self.node.dispatch_relay_job.await_count, 0)
