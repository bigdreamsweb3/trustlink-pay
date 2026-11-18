from .make_ports import make_ports
from .run_cycle import run_cycle


async def test_fair_order(self):
    node = make_ports(fast=[{"id": "funding-1"}, {"id": "funding-2"}],
                      normal=[{"id": "accounting"}, {"id": "tin"}])
    await run_cycle(node)
    self.assertEqual(node.events[:10], ["fast-claim", "verify:funding-1", "coordinate", "normal-claim", "verify:accounting",
                                       "fast-claim", "verify:funding-2", "coordinate", "normal-claim", "verify:tin"])
    self.assertEqual([work["id"] for work in node.processed], ["funding-1", "accounting", "funding-2", "tin"])
    self.assertEqual(node.requests[0], {"nodeId": "synthetic-node", "supportedKinds": ["AUTHORIZED_FUNDING"], "fundingPhase": "SIGNED_DEPOSIT"})
    self.assertEqual(node.requests[1], {"nodeId": "synthetic-node", "supportedKinds": ["AUTHORIZED_FUNDING", "TIN_OPERATION", "SETTLEMENT", "TCAP_EPOCH_ACCOUNTING"]})
