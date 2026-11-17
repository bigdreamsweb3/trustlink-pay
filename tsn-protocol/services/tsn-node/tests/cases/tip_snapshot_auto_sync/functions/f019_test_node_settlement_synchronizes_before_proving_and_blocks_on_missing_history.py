from unittest.mock import AsyncMock
from cases.tip_snapshot_auto_sync.data import ROOTS
from types import SimpleNamespace
from unittest.mock import patch
from cases.tip_snapshot_auto_sync.functions.f020_node_rpc import node_rpc as _case_f020_node_rpc
from functools import partial

async def test_node_settlement_synchronizes_before_proving_and_blocks_on_missing_history(self):
    from server import runtime as server
    self.seed(2)
    node_rpc = partial(_case_f020_node_rpc, self)
    with patch.dict(server.os.environ, {'GPRU_HIDDEN_HEAD_WITNESS_DIR': str(self.directory)}), patch.object(server, '_settlement_funding_context', new=AsyncMock(return_value=(SimpleNamespace(recipientTin='1234567890', recipientHash='ab' * 32, fundingNote={'commitment': 'cd' * 32}), {'tokenId': 7}, {'depositAmountBaseUnits': '1000'}))), patch.object(server, 'read_onchain_tin_tip_route', new=AsyncMock(return_value={'ownerPubkeyHash': 'ab' * 32})), patch.object(server, '_read_tcap_shared_replay_root', new=AsyncMock(return_value=('synthetic-root', bytes(32), 3))), patch.object(server, '_read_gpru_proof_accounts', new=AsyncMock(return_value=(ROOTS[2], b'', 0))), patch.object(server, 'solana_rpc', new=AsyncMock(side_effect=node_rpc)), patch.object(server, 'read_funding_root', new=AsyncMock(return_value={})), patch.object(server, 'ensure_funding_snapshot', new=AsyncMock(return_value={})), patch.object(server, 'funding_membership', return_value={}), patch.object(server, 'prove_hidden_head_credit', new=AsyncMock()) as prover:
        with self.assertRaisesRegex(RuntimeError, 'stop after synchronized snapshot'):
            await server._construct_verified_tcap_transition({})
        self.assert_current_snapshot()
        prover.assert_not_awaited()
        (self.directory / f'tip-{ROOTS[2]}.json').unlink()
        self.entries = []
        with self.assertRaisesRegex(RuntimeError, 'append history is incomplete'):
            await server._construct_verified_tcap_transition({})
        prover.assert_not_awaited()
