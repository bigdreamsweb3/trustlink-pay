import asyncio
from core.worker.receiver_verification_worker import receiver_verification_worker
from .make_ports import make_ports


async def test_funding_during_slow_work(self):
    node = make_ports(normal=[{"id": "expensive"}])
    ordinary = asyncio.create_task(receiver_verification_worker(node))
    funding = asyncio.create_task(receiver_verification_worker(node, signed_funding_only=True))
    node._receiver_wake_event.set()
    try:
        await asyncio.wait_for(node.expensive_started.wait(), timeout=2)
        node.fast.append({"id": "funding-during-proof"})
        node._receiver_funding_wake_event.set()
        await asyncio.wait_for(node.funding_finished.wait(), timeout=2)
        self.assertFalse(node.release_expensive.is_set())
        self.assertEqual([w["id"] for w in node.processed], ["expensive", "funding-during-proof"])
        self.assertEqual(node.events.count("coordinate"), 1)
        funding_requests = [r for r in node.requests if r.get("fundingPhase") == "SIGNED_DEPOSIT"]
        self.assertTrue(funding_requests)
        self.assertTrue(all(r["supportedKinds"] == ["AUTHORIZED_FUNDING"] for r in funding_requests))
        ordinary_requests = [r for r in node.requests if "fundingPhase" not in r]
        self.assertTrue(all("AUTHORIZED_FUNDING" not in r["supportedKinds"] for r in ordinary_requests))
    finally:
        ordinary.cancel()
        funding.cancel()
        await asyncio.gather(ordinary, funding, return_exceptions=True)
