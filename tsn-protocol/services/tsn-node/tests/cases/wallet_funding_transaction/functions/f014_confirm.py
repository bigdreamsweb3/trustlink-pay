from unittest.mock import AsyncMock
from unittest.mock import patch
from server import runtime as server

async def confirm(self, response=None):
    rpc = AsyncMock(return_value=response or self.tx)
    with patch.object(server, 'solana_rpc', rpc):
        receipt = await server._verify_confirmed_tcap_deposit(funding_work=self.work, transition=self.context, wallet=self.wallet, token_mint=self.payload['tokenMintAddress'])
    self.assertEqual(rpc.call_args.args[1][1]['encoding'], 'base64')
    return receipt
