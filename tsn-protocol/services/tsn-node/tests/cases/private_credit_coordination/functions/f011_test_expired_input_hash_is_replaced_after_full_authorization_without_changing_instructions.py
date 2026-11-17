from app.solana_pubkey import Pubkey
import base64
from unittest.mock import patch
from cases.shared_value import SharedValue
from cases.private_credit_coordination.functions.f012_authorize import authorize as _case_f012_authorize
from functools import partial
from cases.private_credit_coordination.functions.f013_rpc import rpc as _case_f013_rpc
from cases.private_credit_coordination.functions.f014_callback import callback as _case_f014_callback

async def test_expired_input_hash_is_replaced_after_full_authorization_without_changing_instructions(self):
    from server import runtime as server
    from nacl.signing import VerifyKey
    from unittest.mock import AsyncMock
    for elapsed in (32, 37):
        fixture = self.signing_fixture()
        value, work, _, original, fresh, authority, key = fixture
        completed = SharedValue(False)
        clock = [100.0]
        reads = []
        authorize = partial(_case_f012_authorize, clock, completed, elapsed, value, work)
        rpc = partial(_case_f013_rpc, completed, fresh, original, reads, self)
        with patch.object(server.time, 'monotonic', side_effect=partial(_case_f014_callback, clock)):
            result = await self.sign_fixture(fixture, rpc, authorization=authorize)
        refreshed = base64.b64decode(result['messageBase64'])
        self.assertEqual(refreshed[:8], original[:8])
        self.assertEqual(refreshed[40:], original[40:])
        self.assertEqual(refreshed[8:40], bytes(Pubkey.from_string(fresh)))
        key.sign.assert_called_once_with(refreshed)
        VerifyKey(bytes(Pubkey.from_string(authority))).verify(refreshed, base64.b64decode(result['signatureBase64']))
        self.assertEqual(result['blockhash'], fresh)
        self.assertEqual(result['lastValidBlockHeight'], '1000')
        self.assertEqual(result['blockhashContextSlot'], '140')
        self.assertEqual(reads, ['getLatestBlockhash', 'isBlockhashValid'])
