from unittest.mock import AsyncMock
from unittest.mock import Mock
from unittest.mock import patch
from server import runtime as server

async def test_epoch_coordinator_uses_deposit_accounts_after_budget_prefix(self):
    response = Mock()
    response.json.return_value = {'work': [self.work], 'nextCursor': None}
    epoch = AsyncMock(return_value={'count': 0})
    with patch.dict(server.os.environ, {'GPRU_HIDDEN_HEAD_WITNESS_DIR': 'offline-fixture'}), patch.object(server, 'receiver_request', AsyncMock(return_value=response)), patch.object(server, 'read_epoch', epoch):
        await server._coordinate_private_credit_work(Mock(), {})
    epoch.assert_awaited_once_with(server.solana_rpc, self.context['depositAccounts']['assetEntry'], self.context['depositAccounts']['reserveState'])
