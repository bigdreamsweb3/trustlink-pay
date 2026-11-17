from unittest.mock import patch

async def sign_fixture(self, fixture, rpc, receiver=None, authorization=None):
    from server import runtime as server
    from unittest.mock import AsyncMock
    value, work, body, _, _, authority, key = fixture
    with patch.object(server, 'create_settlement_authorization', authorization or AsyncMock(return_value={'transition': value, 'workStateVersion': work['stateVersion']})), patch.object(server, '_mother_authority_signing_key', return_value=key), patch.object(server, '_assert_mother_authority_key_matches_chain', AsyncMock(return_value=authority)), patch.object(server, '_receiver_work_by_id', receiver or AsyncMock(return_value=work)), patch.object(server, 'solana_rpc', side_effect=rpc):
        return await server.sign_settlement_transaction(body)
