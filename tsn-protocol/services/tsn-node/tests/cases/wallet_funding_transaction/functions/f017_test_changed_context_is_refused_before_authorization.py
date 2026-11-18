from unittest.mock import AsyncMock, patch
from app.solana_pubkey import Pubkey
from server import runtime as server


async def test_changed_context_is_refused_before_authorization(self):
    context = {**self.payload['senderFundingBlockhashContext'], 'blockhash': str(Pubkey(bytes([98]) * 32))}
    with patch.object(server, '_verify_payment_authorization_from_signed_message', AsyncMock()) as authorization, patch.object(server, '_simulate_owner_signed_tcap_deposit', AsyncMock()) as simulation:
        with self.assertRaisesRegex(ValueError, 'SIGNED_BLOCKHASH_MISMATCH'):
            await server._verify_receiver_work({**self.work, 'payload': {**self.payload, 'senderFundingBlockhashContext': context}})
        authorization.assert_not_awaited()
        simulation.assert_not_awaited()
