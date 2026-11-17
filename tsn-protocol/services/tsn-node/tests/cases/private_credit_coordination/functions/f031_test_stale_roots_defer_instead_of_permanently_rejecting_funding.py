from unittest.mock import patch
from cases.private_credit_coordination.functions.f032_raise_for_status import raise_for_status as _case_f032_raise_for_status

async def test_stale_roots_defer_instead_of_permanently_rejecting_funding(self):
    from server import runtime as server
    from unittest.mock import AsyncMock
    work = {'id': 'synthetic-settlement', 'kind': 'SETTLEMENT', 'stateVersion': 4, 'payloadCommitment': 'a' * 64}

    class Response:
        raise_for_status = _case_f032_raise_for_status
    for reason in (server.FUNDING_ROOT_CHANGED, 'TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT', 'TCAP_CREDIT_EPOCH_CHANGED_BEFORE_SETTLEMENT'):
        verifier = AsyncMock(side_effect=ValueError(reason))
        request = AsyncMock(return_value=Response())
        with patch.object(server, '_verify_receiver_work', verifier), patch.object(server, 'receiver_request', request):
            await server._verify_and_report_receiver_work(None, {}, work)
        request.assert_awaited_once()
        self.assertEqual(request.call_args.args[2], '/api/internal/node/coordination')
        self.assertEqual(request.call_args.kwargs['json']['action'], 'defer')
