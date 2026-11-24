"""An identical durable debit retry survives expiry without another proof or approval."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
from fastapi import HTTPException
from api.handlers.post_tin_debit import post_tin_debit
from core.schemas.tin_debit_request import TinDebitRequest


async def test_ingress_retry(self):
    opening={"version":1,"recordType":"tsn-gpru-tin-debit-opening-v1","leg":0,"authorizationCommitment":"01"*32,
        "routeKeyCommitment":"02"*32,"tokenId":1,"sequence":"1","previousMemoCommitment":"03"*32,"balance":"100","blinding":"17",
        "ownerPublicKey":"04"*32,"signature":"05"*64}
    request=TinDebitRequest(paymentId="same-debit",senderTin="1234567890",recipientTin="2345678901",tokenMintAddress="11111111111111111111111111111111",
        amountBaseUnits="30",nonce="79",amountBlinding="123",deploymentCommitment="06"*32,validAfterSlot="1",expiresAtSlot="2",
        approval={"ownerPublicKey":"04"*32,"signature":"07"*64},senderOpening=opening)
    existing={"id":request.paymentId,"kind":"TIN_DEBIT","status":"CONFIRMED","stateVersion":9,"payload":request.model_dump()}
    node=SimpleNamespace(TSN_RECEIVER_URL="https://offline.invalid",TSN_RECEIVER_NODE_API_KEY="synthetic",
        _receiver_work_by_id=AsyncMock(return_value=existing),read_onchain_tin_tip_route=AsyncMock(side_effect=AssertionError("No route resolution on exact retry")))
    self.assertEqual(await post_tin_debit(node,request),{"workId":"same-debit","status":"CONFIRMED","stateVersion":9})
    changed=request.model_copy(update={"nonce":"80"})
    with self.assertRaises(HTTPException) as error:await post_tin_debit(node,changed)
    self.assertEqual(error.exception.status_code,409)
    node.read_onchain_tin_tip_route.assert_not_awaited()
