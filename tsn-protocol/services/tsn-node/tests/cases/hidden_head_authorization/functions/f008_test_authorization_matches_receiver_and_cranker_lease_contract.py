from datetime import datetime
from server import runtime as server

async def test_authorization_matches_receiver_and_cranker_lease_contract(self):
    result = await self.authorize()
    self.assertEqual(result['kind'], 'TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3')
    self.assertEqual(result['transition'], self.transition)
    self.assertEqual(result['leaseId'], 'mock-lease')
    self.assertEqual(result['leaseVersion'], 4)
    self.assertEqual(result['workStateVersion'], 4)
    self.assertEqual(result['leaseExpiresAt'], self.work['crankerLease']['expiresAt'])
    expected = int(datetime.fromisoformat(result['leaseExpiresAt'].replace('Z', '+00:00')).timestamp())
    self.assertEqual(result['expiresAtTs'], expected)
    server.prove_hidden_head_credit.assert_awaited_once()
    self.assertEqual(server.prove_hidden_head_credit.call_args.kwargs['existing_proof'], self.proof)
