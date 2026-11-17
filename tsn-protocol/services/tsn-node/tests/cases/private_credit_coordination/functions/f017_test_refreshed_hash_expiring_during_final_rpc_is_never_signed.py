

async def test_refreshed_hash_expiring_during_final_rpc_is_never_signed(self):
    from server import runtime as server
    for validity in (False, None, 1, 'true', {}):
        fixture = self.signing_fixture()
        with self.assertRaises(server.HTTPException) as rejected:
            await self.sign_fixture(fixture, self.signing_rpc(fixture, validity=validity))
        self.assertIn('blockhash is no longer valid', rejected.exception.detail)
        fixture[-1].sign.assert_not_called()
