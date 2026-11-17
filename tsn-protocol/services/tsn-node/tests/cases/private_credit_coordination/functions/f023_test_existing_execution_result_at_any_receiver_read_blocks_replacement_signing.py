

async def test_existing_execution_result_at_any_receiver_read_blocks_replacement_signing(self):
    from server import runtime as server
    from unittest.mock import AsyncMock
    for result in ({'signature': 'recorded'}, {'wireSha256': 'recorded'}, {'stage': 'SIGNED'}, {'reason': 'failed'}, 'invalid', []):
        for checkpoint_read in (1, 2):
            fixture = self.signing_fixture()
            work = fixture[1]
            changed = {**work, 'result': result}
            receiver = AsyncMock(side_effect=[changed if checkpoint_read == 1 else work, changed])
            rpc = AsyncMock()
            with self.assertRaises(server.HTTPException) as rejected:
                await self.sign_fixture(fixture, rpc, receiver=receiver)
            self.assertEqual(rejected.exception.detail, 'TCAP_SETTLEMENT_EXECUTION_CHECKPOINT_PRESENT')
            fixture[-1].sign.assert_not_called()
            rpc.assert_not_awaited()
    for result in (None, {}):
        fixture = self.signing_fixture()
        fixture[1]['result'] = result
        await self.sign_fixture(fixture, self.signing_rpc(fixture))
