from .make_ports import make_ports
from .run_cycle import run_cycle


async def test_fair_order(self):
    node = make_ports(authorization=[{"id": "approval-1"}, {"id": "approval-2"}],
                      normal=[{"id": "accounting"}, {"id": "tin"}])
    await run_cycle(node)
    self.assertEqual(node.events[:10], ["authorization-claim", "verify:approval-1", "coordinate", "normal-claim", "verify:accounting",
                                       "authorization-claim", "verify:approval-2", "coordinate", "normal-claim", "verify:tin"])
    self.assertEqual([work["id"] for work in node.processed], ["approval-1", "accounting", "approval-2", "tin"])
    self.assertEqual(node.requests[0], {"nodeId": "synthetic-node", "supportedKinds": ["AUTHORIZED_FUNDING"], "fundingPhase": "AUTHORIZATION"})
    self.assertEqual(node.requests[1], {"nodeId": "synthetic-node", "supportedKinds": ["TIN_OPERATION", "SETTLEMENT", "TIN_DEBIT", "TCAP_EPOCH_ACCOUNTING"]})
