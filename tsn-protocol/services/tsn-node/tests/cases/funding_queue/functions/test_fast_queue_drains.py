from .make_ports import make_ports
from .run_cycle import run_cycle


async def test_fast_queue_drains(self):
    node = make_ports(fast=[{"id": "first"}, {"id": "second"}])
    await run_cycle(node, signed_funding_only=True)
    self.assertEqual([work["id"] for work in node.processed], ["first", "second"])
    self.assertNotIn("coordinate", node.events)
    self.assertEqual(len(node.requests), 3)
