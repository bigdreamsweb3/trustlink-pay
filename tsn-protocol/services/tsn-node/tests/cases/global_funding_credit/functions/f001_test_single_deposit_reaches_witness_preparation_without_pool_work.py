from unittest.mock import AsyncMock
from unittest.mock import Mock
from pathlib import Path
from app.solana_pubkey import Pubkey
from types import SimpleNamespace
from test_funding_note import append_event
from funding_note import funded_leaf
from funding_note import funding_nullifier
from funding_snapshot_sync import funding_root_address
from hidden_head_witness import hex_field
from test_funding_note import note
from unittest.mock import patch
from test_funding_note import root_account
from server import runtime as server
import tempfile
from cases.global_funding_credit.functions.f002_callback import callback as _case_f002_callback
from cases.global_funding_credit.functions.f003_rpc import rpc as _case_f003_rpc
from functools import partial

async def test_single_deposit_reaches_witness_preparation_without_pool_work(self):
    opening = note()
    leaves = [funded_leaf(opening['commitment'], 7, 1000)]
    request = SimpleNamespace(recipientTin='1234567890', recipientHash='offline-owner', fundingNote=opening)
    account = _case_f002_callback
    asset = {'assetEntry': account(7), 'tokenId': 7}
    context = {'depositAmountBaseUnits': '1000', 'nullifier': funding_nullifier(opening), 'depositAccounts': {'config': account(8), 'reserveState': account(9)}}
    receipt = append_event(0, opening, 7, 1000, leaves)
    receipt['transaction'] = {'signatures': ['offline-confirmed-deposit']}
    methods = []
    rpc = partial(_case_f003_rpc, leaves, methods, receipt, self)
    witness_store = Mock()
    witness_store.prepare_credit.side_effect = RuntimeError('OFFLINE_WITNESS_REACHED')
    with tempfile.TemporaryDirectory() as directory:
        with patch.dict(server.os.environ, {'GPRU_HIDDEN_HEAD_WITNESS_DIR': directory}), patch.object(server, '_settlement_funding_context', AsyncMock(return_value=(request, asset, context))), patch.object(server, 'read_onchain_tin_tip_route', AsyncMock(return_value={'ownerPubkeyHash': 'offline-owner'})), patch.object(server, '_assert_recipient_hash_matches_owner'), patch.object(server, '_read_tcap_shared_replay_root', AsyncMock(return_value=(account(10), bytes.fromhex(hex_field(19)), 0))), patch.object(server, '_read_gpru_proof_accounts', AsyncMock(return_value=(hex_field(23), b'offline-verifier', 1))), patch.object(server, 'ensure_tip_snapshot', AsyncMock(return_value={'published': False})), patch.object(server, '_current_credit_epoch', AsyncMock(return_value=(account(11), 0))), patch.object(server, 'HiddenHeadWitnessStore', return_value=witness_store), patch.object(server, 'solana_rpc', side_effect=rpc):
            with self.assertRaisesRegex(RuntimeError, 'OFFLINE_WITNESS_REACHED'):
                await server._construct_verified_tcap_transition({'kind': 'AUTHORIZED_FUNDING', 'status': 'CONFIRMED'})
        witness_store.prepare_credit.assert_called_once()
        prepared = witness_store.prepare_credit.call_args.kwargs
        self.assertEqual(prepared['amount'], 1000)
        self.assertEqual(prepared['funding_note'], opening)
        self.assertEqual(prepared['funding_membership']['fundingIndex'], 0)
        self.assertEqual(len(list(Path(directory).glob('funding-*.json'))), 1)
    self.assertNotIn('getProgramAccounts', methods)
    self.assertNotIn('getRecentPerformanceSamples', methods)
