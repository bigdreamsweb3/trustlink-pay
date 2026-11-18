from unittest.mock import patch
from server import runtime as server
from app.solana_pubkey import Pubkey


async def test_changed_or_malformed_context_is_rejected_without_rpc(self):
    malformed = [None, {}, {**self.blockhash_context, 'blockhash': str(Pubkey(bytes([98]) * 32))},
                 {**self.blockhash_context, 'blockhash': '1' * 32},
                 {**self.blockhash_context, 'contextSlot': True}, {**self.blockhash_context, 'lastValidBlockHeight': '1000'},
                 {**self.blockhash_context, 'contextSlot': -1}, {**self.blockhash_context, 'lastValidBlockHeight': 9007199254740992},
                 {**self.blockhash_context, 'privateExtra': 'must-not-forward'}]
    with patch.object(server.httpx, 'AsyncClient') as client:
        for context in malformed:
            with self.subTest(context=context), self.assertRaises(ValueError):
                await server._simulate_owner_signed_tcap_deposit(self.wire, context)
        client.assert_not_called()
