"""sign_settlement_transaction: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from functools import partial
from .sign_settlement_transaction_key import sign_settlement_transaction_key
from fastapi import Depends
from fastapi import HTTPException
from typing import Any
import base64
import binascii
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _assert_current_settlement_lease: Callable[..., Any]
    _assert_mother_authority_key_matches_chain: Callable[..., Any]
    _assert_unsigned_native_settlement: Callable[..., Any]
    _mother_authority_signing_key: Callable[..., Any]
    _native_blockhash_lifetime: Callable[..., Any]
    _receiver_work_by_id: Callable[..., Any]
    _verify_mother_signed_tcap_settlement_message: Callable[..., Any]
    _verify_private_coordination_message: Callable[..., Any]
    create_settlement_authorization: Callable[..., Any]
    solana_rpc: Callable[..., Any]


async def sign_settlement_transaction(node: Dependencies, body: dict[str, Any]) -> dict[str, Any]:
    """Validate leased native settlement and sign its freshly hashed V1 message."""
    settlement_id = str(body.get("workId") or "").strip()
    operator = str(body.get("crankerPubkey") or "").strip()
    encoded_message = str(body.get("messageBase64") or "").strip()
    if not settlement_id or not operator or not encoded_message:
        raise HTTPException(422, "workId, crankerPubkey, and messageBase64 are required")
    if len(encoded_message) > 16_384:
        raise HTTPException(413, "Settlement transaction message is too large")
    try:
        message = base64.b64decode(encoded_message, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(422, "Settlement transaction message is invalid base64") from exc
    if not message or base64.b64encode(message).decode("ascii") != encoded_message:
        raise HTTPException(422, "Settlement transaction message encoding is not canonical")

    initial_work = await node._receiver_work_by_id(settlement_id)
    node._assert_current_settlement_lease(initial_work, operator)
    node._assert_unsigned_native_settlement(initial_work)
    current_kind = initial_work["kind"]
    authorization = await node.create_settlement_authorization({"workId": settlement_id, "crankerPubkey": operator})
    transition = authorization.get("transition")
    if not isinstance(transition, dict):
        raise HTTPException(422, "Node settlement authorization has no verified TCAP transition")
    signing_key = node._mother_authority_signing_key()
    authority = await node._assert_mother_authority_key_matches_chain(signing_key)
    verify_message = (partial(sign_settlement_transaction_key, current_kind, node, operator, authority, transition))
    verify_message(message)
    current_work = await node._receiver_work_by_id(settlement_id)
    node._assert_current_settlement_lease(current_work, operator)
    node._assert_unsigned_native_settlement(current_work)
    if current_work.get("kind") != current_kind or current_work.get("stateVersion") != authorization.get("workStateVersion"):
        raise HTTPException(409, "Settlement lease changed before signing")
    latest_config = {"commitment": "confirmed"}
    minimum_slot = 0
    latest = await node.solana_rpc("getLatestBlockhash", [latest_config])
    blockhash, recent_blockhash, last_valid_height, issuing_slot = node._native_blockhash_lifetime(latest, minimum_slot)
    # V1 has a fixed hash field at bytes 8..39. All inspected instructions,
    # accounts, roles, config and signer ordering remain byte-for-byte identical.
    message = message[:8] + recent_blockhash + message[40:]
    if verify_message(message) != recent_blockhash:
        raise HTTPException(409, "TCAP_TRANSACTION_BLOCKHASH_MESSAGE_MISMATCH")
    blockhash_status = await node.solana_rpc("isBlockhashValid", [blockhash,
        {"commitment": "confirmed", "minContextSlot": issuing_slot}])
    blockhash_result = blockhash_status.get("result") if isinstance(blockhash_status, dict) else None
    context = blockhash_result.get("context") if isinstance(blockhash_result, dict) else None
    signing_slot = context.get("slot") if isinstance(context, dict) else None
    if type(signing_slot) is not int or not 0 < signing_slot <= 0xFFFFFFFFFFFFFFFF or signing_slot < issuing_slot:
        raise HTTPException(409, "TCAP_TRANSACTION_BLOCKHASH_CONTEXT_INVALID")
    if not isinstance(blockhash_result, dict) or blockhash_result.get("value") is not True:
        raise HTTPException(409, "Cranker transaction blockhash is no longer valid; rebuild and request a fresh Mother signature")
    # No awaited work follows final validity. Receiver's versioned durable
    # checkpoint still rejects a lease/result changed after our last snapshot.
    node._assert_current_settlement_lease(current_work, operator)
    node._assert_unsigned_native_settlement(current_work)
    if current_work.get("stateVersion") != authorization.get("workStateVersion"):
        raise HTTPException(409, "Settlement lease changed before signing")
    if verify_message(message) != recent_blockhash:
        raise HTTPException(409, "TCAP_TRANSACTION_BLOCKHASH_MESSAGE_MISMATCH")
    signature = signing_key.sign(message).signature
    return {"authority": authority, "signatureBase64": base64.b64encode(signature).decode("ascii"),
        "messageBase64": base64.b64encode(message).decode("ascii"), "blockhash": blockhash,
        "lastValidBlockHeight": str(last_valid_height), "blockhashContextSlot": str(issuing_slot)}
