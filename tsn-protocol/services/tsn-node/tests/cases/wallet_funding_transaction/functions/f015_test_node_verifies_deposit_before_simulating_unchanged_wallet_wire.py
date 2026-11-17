from unittest.mock import AsyncMock
from unittest.mock import patch
from server import runtime as server

async def test_node_verifies_deposit_before_simulating_unchanged_wallet_wire(self):
    accounts = self.context['depositAccounts']
    fields = {'tokenDecimals': 6, 'tcapAssetEntry': accounts['assetEntry'], 'tokenProgram': accounts['tokenProgram']}
    simulation = AsyncMock(return_value={'programSimulation': 'PASSED'})
    with patch.object(server, '_verify_payment_authorization_from_signed_message', AsyncMock(return_value=fields)), patch.object(server, '_simulate_owner_signed_tcap_deposit', simulation):
        result = await server._verify_receiver_work({**self.work, 'status': 'NODE_VERIFYING'})
    self.assertEqual(result['verifiedPayload']['senderSignedFundingTransaction'], self.wire)
    simulation.assert_awaited_once_with(self.wire)
