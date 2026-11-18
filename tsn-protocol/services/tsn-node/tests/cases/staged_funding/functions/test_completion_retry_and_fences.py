from unittest.mock import AsyncMock, patch
import httpx
from server import runtime as node
from core.schemas.complete_funding_request import CompleteFundingRequest
from api.handlers.post_complete_funding import post_complete_funding
from fastapi import HTTPException


async def test_completion_retry_and_fences(self):
    work = {**self.work, 'status': 'FUNDING_READY', 'fundingPhase': 'AUTHORIZATION'}
    request = CompleteFundingRequest(workId=work['id'], senderPubkey=self.wallet, authorizationSignature=self.payload['senderAuthorizationSignature'],
        expectedStateVersion=work['stateVersion'], authorizationPayloadCommitment='22' * 32, senderFundingDepositTxB64=self.wire,
        senderFundingBlockhashContext=self.payload['senderFundingBlockhashContext'])
    response = httpx.Response(200, json={'work': {**work, 'stateVersion': 5, 'status': 'RECEIVED', 'fundingPhase': 'SIGNED_DEPOSIT'}})
    with patch.object(node, '_receiver_work_by_id', AsyncMock(return_value=work)), patch.object(node, '_node_verification_signing_key', return_value=self.key), \
         patch.object(node, 'receiver_request', AsyncMock(return_value=response)) as attach:
        result = await post_complete_funding(node, request)
        self.assertEqual(result['fundingPhase'], 'SIGNED_DEPOSIT')
        self.assertEqual(attach.await_args.kwargs['json']['id'], work['id'])
        with self.assertRaises(HTTPException) as error:
            await post_complete_funding(node, request.model_copy(update={'expectedStateVersion': 3}))
        self.assertEqual(error.exception.detail, 'STALE_STATE_VERSION')
    with patch.object(node, '_receiver_work_by_id', AsyncMock(return_value=self.work)), patch.object(node, 'receiver_request', AsyncMock(return_value=response)) as attach:
        await post_complete_funding(node, request)
        with self.assertRaises(HTTPException) as error:
            await post_complete_funding(node, request.model_copy(update={'senderFundingDepositTxB64': 'different-wire'}))
        self.assertEqual(error.exception.detail, 'FUNDING_ATTACHMENT_CONFLICT')
        self.assertEqual(attach.await_count, 1)
