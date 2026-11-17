import base64
from unittest.mock import patch
from cases.private_credit_coordination.functions.f020_rpc import rpc as _case_f020_rpc
from functools import partial
from cases.private_credit_coordination.functions.f021_callback import callback as _case_f021_callback
from cases.private_credit_coordination.functions.f022_callback import callback as _case_f022_callback

# Their instruction-specific parsers have separate ABI mutation tests.
async def test_native_credit_and_epoch_receive_same_fresh_message_contract(self):
    from server import runtime as server
    from unittest.mock import AsyncMock
    for kind in ('SETTLEMENT', 'TCAP_EPOCH_ACCOUNTING'):
        fixture = self.signing_fixture()
        fixture[1]['kind'] = kind
        rpc = partial(_case_f020_rpc, fixture, self)
        with patch.object(server, '_verify_mother_signed_tcap_settlement_message', side_effect=_case_f021_callback), patch.object(server, '_verify_private_coordination_message', side_effect=_case_f022_callback), patch.object(server, 'read_funding_root', AsyncMock()) as root:
            result = await self.sign_fixture(fixture, rpc)
        self.assertEqual(result['blockhash'], fixture[4])
        fixture[-1].sign.assert_called_once_with(base64.b64decode(result['messageBase64']))
