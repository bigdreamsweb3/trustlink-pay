from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from server import runtime as server


async def test_issuance_rejects_unknown_and_noncanonical_checks(self):
    invalid_validity = [None, {}, {'error': {'code': -32016}},
        {'result': {'context': {'slot': 123}, 'value': 1}},
        {'result': {'context': {'slot': '123'}, 'value': True}},
        {'result': {'context': {'slot': True}, 'value': True}},
        {'result': {'context': {'slot': 122}, 'value': True}},
        {'result': {'context': {'slot': 9007199254740992}, 'value': True}}]
    invalid_heights = [None, {}, {'error': {'code': -32005}}, {'result': True}, {'result': '850'}, {'result': -1}, {'result': 9007199254740992}]
    for stage, invalid_cases in (('validity', invalid_validity), ('height', invalid_heights)):
        for invalid in invalid_cases:
            responses = []
            for slot in (123, 125, 127):
                responses.append({'result': {'context': {'slot': slot}, 'value': {'blockhash': self.blockhash_context['blockhash'], 'lastValidBlockHeight': 1000}}})
                if stage == 'validity':
                    responses.append(invalid)
                else:
                    responses.extend([{'result': {'context': {'slot': slot + 1}, 'value': True}}, invalid])
            with self.subTest(stage=stage, invalid=invalid), patch.object(server, 'solana_rpc', AsyncMock(side_effect=responses)):
                with self.assertRaises(HTTPException) as raised:
                    await server.get_network_recent_blockhash()
            self.assertEqual(raised.exception.status_code, 503)
