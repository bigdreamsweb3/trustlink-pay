

async def test_lease_or_kind_change_after_authorization_blocks_new_hash(self):
    from server import runtime as server
    from unittest.mock import AsyncMock
    for update in ({'stateVersion': 8}, {'kind': 'SETTLEMENT'}, {'crankerLease': {'owner': 'other', 'expiresAt': '2040-01-01T00:00:00Z'}}):
        fixture = self.signing_fixture()
        work = fixture[1]
        receiver = AsyncMock(side_effect=[work, {**work, **update}])
        rpc = AsyncMock()
        with self.assertRaises(server.HTTPException):
            await self.sign_fixture(fixture, rpc, receiver=receiver)
        fixture[-1].sign.assert_not_called()
        rpc.assert_not_awaited()
