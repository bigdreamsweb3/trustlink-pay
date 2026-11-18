from unittest.mock import AsyncMock, patch
from server import runtime as node
from core.schemas.funding_readiness_request import FundingReadinessRequest
from api.handlers.post_funding_readiness import post_funding_readiness
from fastapi import HTTPException


async def test_owner_readiness(self):
    work = {**self.work, 'status': 'FUNDING_READY', 'fundingPhase': 'AUTHORIZATION'}
    request = FundingReadinessRequest(workId=work['id'], senderPubkey=self.wallet, authorizationSignature=self.payload['senderAuthorizationSignature'])
    with patch.object(node, '_receiver_work_by_id', AsyncMock(return_value=work)), patch.object(node, '_node_verification_signing_key', return_value=self.key):
        result = await post_funding_readiness(node, request)
        self.assertEqual(result['depositAccounts'], self.preflight['depositAccounts'])
        self.assertEqual(set(result), {'workId', 'stateVersion', 'authorizationPayloadCommitment', 'expiresAt', 'depositAccounts', 'amountBaseUnits'})
        with self.assertRaises(HTTPException) as error:
            await post_funding_readiness(node, request.model_copy(update={'authorizationSignature': 'invalid'}))
        self.assertEqual(error.exception.status_code, 403)
