from cases.private_credit_coordination.functions.f026_rpc import rpc as _case_f026_rpc
from functools import partial

async def test_live_lease_expiry_during_final_hash_check_prevents_signature(self):
    from server import runtime as server
    fixture = self.signing_fixture()
    work = fixture[1]
    base = self.signing_rpc(fixture)
    rpc = partial(_case_f026_rpc, base, work)
    with self.assertRaises(server.HTTPException) as rejected:
        await self.sign_fixture(fixture, rpc)
    self.assertEqual(rejected.exception.detail, 'Settlement Cranker lease is expired or invalid')
    fixture[-1].sign.assert_not_called()
