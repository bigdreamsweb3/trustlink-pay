import base64

async def test_altered_native_instruction_is_never_refreshed_or_signed(self):
    from server import runtime as server
    from unittest.mock import AsyncMock
    fixture = self.signing_fixture()
    changed = bytearray(fixture[3])
    changed[-1] ^= 1
    fixture[2]['messageBase64'] = base64.b64encode(changed).decode()
    rpc = AsyncMock()
    with self.assertRaises(server.HTTPException) as rejected:
        await self.sign_fixture(fixture, rpc)
    self.assertEqual(rejected.exception.detail, 'PRIVATE_COORDINATION_MESSAGE_MISMATCH')
    fixture[-1].sign.assert_not_called()
    rpc.assert_not_awaited()
