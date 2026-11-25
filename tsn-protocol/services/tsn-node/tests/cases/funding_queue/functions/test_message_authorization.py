from .make_ports import make_ports
from .run_cycle import run_cycle


async def test_message_authorization(self):
    work = {"id": "message-only", "kind": "AUTHORIZED_FUNDING", "fundingPhase": "AUTHORIZATION",
            "stateVersion": 2, "nodeLease": {"leaseId": "original-generation"}, "payloadCommitment": "ab" * 32}
    node = make_ports(authorization=[work])
    await run_cycle(node)
    self.assertEqual(node.events[:4], ["authorization-claim", "verify:message-only", "coordinate", "normal-claim"])
    self.assertEqual(node.processed, [work])
    self.assertEqual(node.processed[0]["nodeLease"], work["nodeLease"])
