from unittest.mock import AsyncMock, patch
from server import runtime as node
from verification.work.prepare_receiver_funding import prepare_receiver_funding


async def test_authorization_readiness(self):
    initial = {k: v for k, v in self.payload.items() if k not in ('senderSignedFundingTransaction', 'senderFundingBlockhashContext')}
    work = {**self.work, 'payload': initial, 'fundingPhase': 'AUTHORIZATION', 'payloadCommitment': '22' * 32}
    with patch.object(node, '_verify_payment_authorization_from_signed_message', AsyncMock(return_value=self.preflight['verifiedFields'])) as authorization, \
         patch('verification.work.prepare_receiver_funding.prepare_funding_deposit_accounts', AsyncMock(return_value=self.preflight['depositAccounts'])), \
         patch.object(node, 'solana_rpc', AsyncMock()) as rpc:
        evidence = await prepare_receiver_funding(node, work)
    self.assertEqual(evidence['verificationType'], 'TSN_FUNDING_AUTHORIZATION_READY')
    self.assertNotIn('verifiedPayload', evidence)
    self.assertNotIn('senderSignedFundingTransaction', evidence['authorizationPreflight'])
    self.assertEqual(authorization.await_args.args[0].model_dump(exclude_none=True), initial)
    self.assertEqual(authorization.await_args.kwargs, {'work_id': work['id'], 'authorization_payload_commitment': '22' * 32})
    rpc.assert_not_awaited()
