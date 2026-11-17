from unittest.mock import AsyncMock
from funding_note import funding_nullifier
from unittest.mock import patch
from server import runtime as server

async def test_settlement_context_selects_actual_deposit_with_budget_prefix_and_suffix(self):
    fields = {'Recipient TIN': self.payload['recipientTin'], 'Token Mint': self.payload['tokenMintAddress'], 'Nonce': self.payload['senderAuthorizationNonce'], 'Token Decimals': '6', 'Amount': '1', 'Funding Note Commitment': self.opening['commitment']}
    asset = {'assetEntry': self.context['depositAccounts']['assetEntry'], 'tokenProgram': self.context['depositAccounts']['tokenProgram'], 'decimals': 6}
    with patch.object(server, '_parse_canonical_message', return_value=fields), patch.object(server, '_verify_ed25519_signature'), patch.object(server, 'resolve_tcap_registered_asset', AsyncMock(return_value=asset)), patch.object(server, 'solana_rpc', AsyncMock(return_value=self.tx)):
        request, resolved, context = await server._settlement_funding_context(self.work)
    self.assertEqual(context['depositAccounts'], self.context['depositAccounts'])
    self.assertEqual(context['fundingNoteCommitment'], self.opening['commitment'])
    self.assertEqual(context['nullifier'], funding_nullifier(self.opening))
