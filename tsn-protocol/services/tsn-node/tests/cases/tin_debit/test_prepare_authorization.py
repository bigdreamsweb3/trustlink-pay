"""Preparation reveals route commitments only to the registered sender owner."""
import hashlib
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from nacl.signing import SigningKey
from fastapi import HTTPException
from api.handlers.prepare_tin_debit import prepare_tin_debit_request
from core.schemas.tin_debit_request import TinDebitPrepareRequest
from datetime import datetime, timezone
from verification.intent.build_canonical_message import _build_canonical_message


async def test_prepare_authorization(self):
    key = SigningKey(bytes([73])*32)
    public = bytes(key.verify_key).hex()
    body = {"senderTin":"1234567890","recipientTin":"2345678901","tokenMintAddress":"11111111111111111111111111111111",
        "ownerPublicKey":public,"expiresAt":str(int(time.time())+240)}
    domain = "..." + hashlib.sha256(b"trustlink-pay:tsn:canonical-signing:v1").hexdigest()[-8:]
    node = SimpleNamespace(TSN_CANONICAL_DOMAIN_DISPLAY=domain)
    expires = datetime.fromtimestamp(int(body["expiresAt"]), timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    message = _build_canonical_message(node, "TIN Balance Payment Preparation", [
        ("Sender TIN", body["senderTin"]), ("Recipient TIN", body["recipientTin"]),
        ("Token Mint", body["tokenMintAddress"]), ("Expires", expires),
    ]).encode("utf-8")
    body["signature"] = key.sign(message).signature.hex()
    route = {"ownerPubkeyHash":hashlib.sha256(bytes(key.verify_key)).hexdigest(),"gpruElgamalKeyCommitment":"01"*32}
    node.read_onchain_tin_tip_route = AsyncMock(return_value=route)
    context = {"asset":{"tokenId":1,"decimals":6},"oldRoot":"02"*32,"tipRoot":"03"*32,"rootSequence":4,"deploymentCommitment":"04"*32,"slot":10}
    with patch("api.handlers.prepare_tin_debit.read_debit_context",AsyncMock(return_value=context)) as read:
        result = await prepare_tin_debit_request(node,TinDebitPrepareRequest(**body))
        self.assertEqual(result["tokenId"],1)
        self.assertEqual(read.await_count,1)
        for field,value in (("signature","00"*64),("recipientTin","3456789012"),("expiresAt",str(int(time.time())+1000))):
            read.reset_mock()
            with self.subTest(field=field),self.assertRaises(HTTPException):
                await prepare_tin_debit_request(node,TinDebitPrepareRequest(**{**body,field:value}))
            read.assert_not_awaited()
    for reason, detail in (("TIN_DEBIT_VERIFIER_UNAVAILABLE", "TIN_DEBIT_VERIFIER_UNAVAILABLE"),
                           ("TIN_DEBIT_ACCOUNT_OWNER_INVALID:config", "TIN_DEBIT_CONTEXT_UNAVAILABLE"),
                           ("private provider response", "TIN_DEBIT_CONTEXT_UNAVAILABLE")):
        with patch("api.handlers.prepare_tin_debit.read_debit_context", AsyncMock(side_effect=ValueError(reason))):
            with self.subTest(reason=reason), self.assertRaises(HTTPException) as failure:
                await prepare_tin_debit_request(node, TinDebitPrepareRequest(**body))
            self.assertEqual(failure.exception.status_code, 503)
            self.assertEqual(failure.exception.detail, detail)
    legacy = b"TSN_TIN_DEBIT_PREPARE_V1\0" + "\n".join(body[n] for n in ("senderTin", "recipientTin", "tokenMintAddress", "expiresAt")).encode()
    with patch("api.handlers.prepare_tin_debit.read_debit_context", AsyncMock()) as read:
        with self.assertRaises(HTTPException):
            await prepare_tin_debit_request(node, TinDebitPrepareRequest(**{**body, "signature": key.sign(legacy).signature.hex()}))
        read.assert_not_awaited()
