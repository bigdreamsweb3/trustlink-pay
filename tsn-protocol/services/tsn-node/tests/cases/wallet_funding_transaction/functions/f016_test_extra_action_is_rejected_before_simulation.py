from unittest.mock import AsyncMock
from unittest.mock import patch
from server import runtime as server
from cases.wallet_funding_transaction.functions.f003_signed_wire import signed_wire

async def test_extra_action_is_rejected_before_simulation(self):
    wire, _ = signed_wire([self.deposit, ('11111111111111111111111111111111', [], bytes(12))], self.key)
    accounts = self.context['depositAccounts']
    fields = {'tokenDecimals': 6, 'tcapAssetEntry': accounts['assetEntry'], 'tokenProgram': accounts['tokenProgram']}
    simulation = AsyncMock()
    with patch.object(server, '_verify_payment_authorization_from_signed_message', AsyncMock(return_value=fields)), patch.object(server, '_simulate_owner_signed_tcap_deposit', simulation):
        with self.assertRaisesRegex(ValueError, 'unsupported additional'):
            await server._verify_receiver_work({**self.work, 'payload': {**self.payload, 'senderSignedFundingTransaction': wire}})
    simulation.assert_not_awaited()
