

async def test_final_validity_context_is_positive_and_nondecreasing(self):
    from server import runtime as server
    for slot in (None, 0, -1, True, 140.0, '140', 139, 2 ** 64):
        fixture = self.signing_fixture()
        rpc = self.signing_rpc(fixture, validity_context={'slot': slot})
        with self.assertRaises(server.HTTPException) as rejected:
            await self.sign_fixture(fixture, rpc)
        self.assertEqual(rejected.exception.detail, 'TCAP_TRANSACTION_BLOCKHASH_CONTEXT_INVALID')
        fixture[-1].sign.assert_not_called()
