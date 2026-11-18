from unittest.mock import AsyncMock, patch
from core.schemas.create_intent_request import CreateIntentRequest
from core.schemas.mempool_intent import MempoolIntent
from server import runtime as server


async def test_confirmed_lineage_needs_receipt_not_expired_context(self):
    payload = {name: value for name, value in self.payload.items() if name != 'senderFundingBlockhashContext'}
    with self.assertRaises(ValueError):
        CreateIntentRequest(**payload)
    self.assertIsNone(MempoolIntent(**payload, id='saved-intent', postedAt='2026-11-17T00:00:00Z', updatedAt='2026-11-17T00:00:00Z').senderFundingBlockhashContext)
    accounts = self.context['depositAccounts']
    fields = {'Recipient TIN': payload['recipientTin'], 'Token Mint': payload['tokenMintAddress'], 'Nonce': payload['senderAuthorizationNonce'],
              'Token Decimals': '6', 'Amount': '1', 'Funding Note Commitment': self.opening['commitment']}
    asset = {'decimals': 6, 'assetEntry': accounts['assetEntry'], 'tokenProgram': accounts['tokenProgram']}
    funding = {**self.work, 'payload': payload}
    with patch.object(server, '_parse_canonical_message', return_value=fields), patch.object(server, '_verify_ed25519_signature'), \
            patch.object(server, 'resolve_tcap_registered_asset', AsyncMock(return_value=asset)), \
            patch.object(server, '_verify_confirmed_tcap_deposit', AsyncMock(return_value={'signature': self.signature})) as receipt:
        request, _, context = await server._settlement_funding_context(funding)
        self.assertIsNone(request.senderFundingBlockhashContext)
        self.assertEqual(context['receipt']['signature'], self.signature)
        receipt.assert_awaited_once()
        receipt.side_effect = ValueError('Finalized receipt does not match original wire')
        with self.assertRaisesRegex(ValueError, 'receipt does not match'):
            await server._settlement_funding_context(funding)
