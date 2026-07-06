from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path as ApiPath, Query

from app import config
from app.schemas.tin import (
    PlatformReadKeyRegistrationRequest,
    PlatformReadKeyRegistrationResponse,
    PublicTinOperationRecord,
    TinDelegatedPlatformRecord,
    TinDelegatedReadRequest,
    TinDelegatedReadResponse,
    TinOperationFeeRecord,
    TinOperationRecord,
    TinOperationStageRequest,
    TinPruRoutePublicResponse,
    TinPruRouteSessionRequest,
    TinPruRouteSessionResponse,
)
from app.solana import read_tin_fee_config
from app.services.auth import _bearer_token, _build_platform_pru_route_request_message, _create_pru_route_session, _read_pru_route_session, _verify_ed25519_signature, require_worker_api_key
from app.services.tins import (
    _delegation_key,
    _fee_amount_base_units,
    _normalize_tin_operation_input,
    _route_owner_pubkey_hash,
    append_unique_signature,
    assert_tin_operation_can_enter,
    compute_tin_fee_commitment_hash,
    compute_tin_fee_split,
    expire_stale_tin_operations,
    list_delegated_read_access_rows,
    mark_tin_pru_route_finalized,
    patch_tin_operation,
    public_tin_operation,
    public_tin_pru_route,
    read_active_delegation,
    read_tin_pru_route,
    verify_owner_pru_route_proof,
    write_shadow_tin_owner,
    write_tin_pru_route,
)
from app.store import get_mempool_store, hget_all_json, k_platform_read_keys, k_tin_fees, k_tin_operations, k_tin_read_delegations
from app.utils.encoding import decode_base58

router = APIRouter()


@router.post("/tin-operations", response_model=PublicTinOperationRecord)
async def post_tin_operation(payload: dict[str, Any]) -> PublicTinOperationRecord:
    operation = _normalize_tin_operation_input(payload)
    pru_route = operation.pop("_pruRoute", None)
    async with config._tin_operation_lock:
        store = await get_mempool_store()
        existing = await store.hget(k_tin_operations(), operation["intentId"])
        if existing:
            return public_tin_operation(json.loads(existing))
        await assert_tin_operation_can_enter(operation)
        if pru_route:
            await write_tin_pru_route(operation, pru_route)
        await store.hset(k_tin_operations(), operation["intentId"], json.dumps(operation))
    config.logger.info("TIN operation queued: %s type=%s tin=%s", operation["intentId"], operation["intentType"], operation["tin"])
    return public_tin_operation(operation)


@router.get("/tin-operations", response_model=list[PublicTinOperationRecord])
async def list_tin_operations(status: Optional[str] = Query(None), intent_type: Optional[str] = Query(None)) -> list[PublicTinOperationRecord]:
    await expire_stale_tin_operations()
    items = await hget_all_json(k_tin_operations())
    if status:
        items = [item for item in items if item.get("status") == status]
    if intent_type:
        items = [item for item in items if item.get("intentType") == intent_type or item.get("intent_type") == intent_type]
    return [public_tin_operation(item) for item in sorted(items, key=lambda item: str(item.get("createdAt") or ""))]


@router.get("/tin-operations/verification-work", response_model=list[TinOperationRecord], dependencies=[Depends(require_worker_api_key)])
async def list_tin_verification_work(limit: int = Query(50, ge=1, le=500)) -> list[TinOperationRecord]:
    await expire_stale_tin_operations()
    items = [TinOperationRecord(**item) for item in await hget_all_json(k_tin_operations()) if item.get("status") in {"pending_verification", "verifier_assigned"}]
    return sorted(items, key=lambda item: item.createdAt)[:limit]


@router.get("/tin-operations/fee-work", response_model=list[TinOperationRecord], dependencies=[Depends(require_worker_api_key)])
async def list_tin_fee_work(operator_pubkey: Optional[str] = Query(None), limit: int = Query(50, ge=1, le=500)) -> list[TinOperationRecord]:
    await expire_stale_tin_operations()
    allow_single = os.environ.get("TSN_ALLOW_SINGLE_CRANKER_TINS") == "1"
    items = []
    for item in await hget_all_json(k_tin_operations()):
        if item.get("status") not in {"verified", "fee_pending"}:
            continue
        if operator_pubkey and item.get("verifierCranker") == operator_pubkey and not allow_single:
            continue
        items.append(TinOperationRecord(**item))
    return sorted(items, key=lambda item: item.createdAt)[:limit]


@router.get("/tin-operations/registry-work", response_model=list[TinOperationRecord], dependencies=[Depends(require_worker_api_key)])
async def list_tin_registry_work(operator_pubkey: Optional[str] = Query(None), limit: int = Query(50, ge=1, le=500)) -> list[TinOperationRecord]:
    await expire_stale_tin_operations()
    items = []
    for item in await hget_all_json(k_tin_operations()):
        if item.get("status") not in {"fee_committed", "submitter_assigned"}:
            continue
        if operator_pubkey and item.get("submitterCranker") and item.get("submitterCranker") != operator_pubkey:
            continue
        items.append(TinOperationRecord(**item))
    return sorted(items, key=lambda item: item.updatedAt)[:limit]


@router.get("/tin-operations/{intent_id}", response_model=PublicTinOperationRecord)
async def get_tin_operation(intent_id: str = ApiPath(...)) -> PublicTinOperationRecord:
    await expire_stale_tin_operations()
    raw = await (await get_mempool_store()).hget(k_tin_operations(), intent_id)
    if not raw:
        raise HTTPException(404, f"TIN operation {intent_id} not found")
    return public_tin_operation(json.loads(raw))


@router.post("/tin-routes/session", response_model=TinPruRouteSessionResponse)
async def create_tin_pru_route_session(body: TinPruRouteSessionRequest) -> TinPruRouteSessionResponse:
    route = await read_tin_pru_route(str(body.tin))
    if not route:
        raise HTTPException(404, f"Finalized PRU route for TIN {body.tin} not found")
    expected_hash = _route_owner_pubkey_hash(route)
    try:
        owner_hash = await verify_owner_pru_route_proof(
            tin=str(body.tin),
            owner_pubkey=body.owner_pubkey,
            signature=body.signature,
            nonce=body.nonce,
            timestamp=body.timestamp,
            purpose="pru_route_lookup",
            accepted_owner_hash=expected_hash,
            signed_message_base64=body.signed_message_base64,
        )
        if expected_hash and expected_hash != owner_hash:
            raise HTTPException(403, "owner proof does not match the finalized PRU route")
        return await _create_pru_route_session(tin=str(body.tin), owner_hash=owner_hash)
    except HTTPException as exc:
        if exc.status_code == 403:
            config.logger.warning("PRU route session rejected: tin=%s owner=%s nonce=%s timestamp=%s detail=%s", body.tin, f"{str(body.owner_pubkey)[:4]}...{str(body.owner_pubkey)[-4:]}", body.nonce, body.timestamp, exc.detail)
        raise


@router.post("/platform/register-read-key", response_model=PlatformReadKeyRegistrationResponse)
async def register_platform_read_key(body: PlatformReadKeyRegistrationRequest) -> PlatformReadKeyRegistrationResponse:
    try:
        decode_base58(body.platform_read_key)
    except ValueError as exc:
        raise HTTPException(422, "platform_read_key is not valid base58") from exc
    contact = body.contact.strip()
    if not contact:
        raise HTTPException(422, "contact is required")
    await (await get_mempool_store()).hset(
        k_platform_read_keys(),
        body.platform_read_key,
        json.dumps({"platformReadKey": body.platform_read_key, "contact": contact, "registeredAt": datetime.now(timezone.utc).isoformat()}),
    )
    return PlatformReadKeyRegistrationResponse(platformReadKey=body.platform_read_key, contact=contact, status="registered")


@router.post("/tin-routes/delegate", response_model=TinDelegatedReadResponse)
async def grant_tin_delegated_read_access(body: TinDelegatedReadRequest) -> TinDelegatedReadResponse:
    platform_raw = await (await get_mempool_store()).hget(k_platform_read_keys(), body.platform_read_key)
    if not platform_raw:
        raise HTTPException(403, "platform read key is not registered")
    expires_at = int(body.expiry or (int(time.time()) + 30 * 24 * 60 * 60))
    if expires_at <= int(time.time()):
        raise HTTPException(422, "delegation expiry must be in the future")
    route = await read_tin_pru_route(str(body.tin))
    if not route:
        raise HTTPException(404, f"Finalized PRU route for TIN {body.tin} not found")
    await verify_owner_pru_route_proof(
        tin=str(body.tin),
        owner_pubkey=body.owner_pubkey,
        signature=body.signature,
        nonce=body.nonce,
        timestamp=body.timestamp,
        purpose="delegate_read_access",
        platform_read_key=body.platform_read_key,
        expiry=expires_at,
        accepted_owner_hash=_route_owner_pubkey_hash(route),
        signed_message_base64=body.signed_message_base64,
    )
    await (await get_mempool_store()).hset(
        k_tin_read_delegations(),
        _delegation_key(str(body.tin), body.platform_read_key),
        json.dumps({"tin": str(body.tin), "platformReadKey": body.platform_read_key, "expiresAt": expires_at, "createdAt": datetime.now(timezone.utc).isoformat()}),
    )
    return TinDelegatedReadResponse(tin=str(body.tin), platformReadKey=body.platform_read_key, expiresAt=expires_at, status="active")


@router.delete("/tin-routes/delegate", response_model=TinDelegatedReadResponse)
async def revoke_tin_delegated_read_access(body: TinDelegatedReadRequest) -> TinDelegatedReadResponse:
    route = await read_tin_pru_route(str(body.tin))
    if not route:
        raise HTTPException(404, f"Finalized PRU route for TIN {body.tin} not found")
    await verify_owner_pru_route_proof(
        tin=str(body.tin),
        owner_pubkey=body.owner_pubkey,
        signature=body.signature,
        nonce=body.nonce,
        timestamp=body.timestamp,
        purpose="revoke_read_access",
        platform_read_key=body.platform_read_key,
        accepted_owner_hash=_route_owner_pubkey_hash(route),
        signed_message_base64=body.signed_message_base64,
    )
    await (await get_mempool_store()).hset(
        k_tin_read_delegations(),
        _delegation_key(str(body.tin), body.platform_read_key),
        json.dumps({"tin": str(body.tin), "platformReadKey": body.platform_read_key, "expiresAt": 0, "revokedAt": datetime.now(timezone.utc).isoformat()}),
    )
    return TinDelegatedReadResponse(tin=str(body.tin), platformReadKey=body.platform_read_key, status="revoked")


@router.get("/tin-routes/{tin}/delegations", response_model=list[TinDelegatedPlatformRecord])
async def list_tin_delegated_read_access(tin: str = ApiPath(...), authorization: Optional[str] = Header(None)) -> list[TinDelegatedPlatformRecord]:
    token = _bearer_token(authorization)
    session = await _read_pru_route_session(token or "")
    if not session or str(session.get("tin")) != str(tin):
        raise HTTPException(403, "valid PRU route session is required")
    return await list_delegated_read_access_rows(str(tin))


@router.get("/tin-routes/{tin}/prus", response_model=TinPruRoutePublicResponse)
async def get_tin_pru_public_addresses(
    tin: str = ApiPath(...),
    authorization: Optional[str] = Header(None),
    platform_read_key: Optional[str] = Header(None, alias="x-platform-key"),
    platform_signature: Optional[str] = Header(None, alias="x-platform-signature"),
) -> TinPruRoutePublicResponse:
    route = await read_tin_pru_route(tin)
    if not route:
        raise HTTPException(404, f"Finalized PRU route for TIN {tin} not found")
    token = _bearer_token(authorization)
    session = await _read_pru_route_session(token or "")
    if session and str(session.get("tin")) == str(tin):
        return public_tin_pru_route(route)
    if platform_read_key and platform_signature:
        delegation = await read_active_delegation(tin=str(tin), platform_read_key=platform_read_key)
        if not delegation:
            raise HTTPException(403, "platform read key has no active delegation for this TIN")
        _verify_ed25519_signature(public_key=platform_read_key, message=_build_platform_pru_route_request_message(tin=str(tin), platform_read_key=platform_read_key), signature_base64=platform_signature)
        return public_tin_pru_route(route)
    raise HTTPException(403, "valid PRU route session or delegated platform signature is required")


@router.post("/tin-operations/{intent_id}/verified", response_model=TinOperationRecord, dependencies=[Depends(require_worker_api_key)])
async def mark_tin_operation_verified(intent_id: str = ApiPath(...), body: TinOperationStageRequest = ...) -> TinOperationRecord:
    cranker = body.verifierCranker or body.crankerPubkey
    if not cranker:
        raise HTTPException(422, "verifier cranker pubkey is required")
    return await patch_tin_operation(intent_id, {"status": "verified", "verifierCranker": cranker}, {"pending_verification", "verifier_assigned"})


@router.post("/tin-operations/{intent_id}/fee-committed", response_model=TinOperationRecord, dependencies=[Depends(require_worker_api_key)])
async def mark_tin_operation_fee_committed(intent_id: str = ApiPath(...), body: TinOperationStageRequest = ...) -> TinOperationRecord:
    verifier = body.verifierCranker or body.crankerPubkey
    submitter = body.submitterCranker
    if not verifier:
        raise HTTPException(422, "verifier cranker pubkey is required")
    if not submitter:
        raise HTTPException(422, "submitter cranker pubkey is required")
    if verifier == submitter and os.environ.get("TSN_ALLOW_SINGLE_CRANKER_TINS") != "1":
        raise HTTPException(409, "verifier and submitter crankers must be different")
    store = await get_mempool_store()
    raw = await store.hget(k_tin_operations(), intent_id)
    if not raw:
        raise HTTPException(404, f"TIN operation {intent_id} not found")
    operation = json.loads(raw)
    if operation.get("status") not in {"verified", "fee_pending"}:
        raise HTTPException(409, f"TIN operation is {operation.get('status')}, not ready for this transition")
    if operation.get("verifierCranker") and operation.get("verifierCranker") != verifier:
        raise HTTPException(409, "verification work is assigned to a different verifier cranker")
    gross = _fee_amount_base_units(operation)
    if gross <= 0:
        raise HTTPException(409, "TIN operation fee amount is invalid")
    split = compute_tin_fee_split(gross)
    chain_split = await read_tin_fee_config()
    for key in ("verifier", "submitter", "team", "reserve_pool"):
        if int(chain_split.get(key) or -1) != int(config.TIN_FEE_SPLIT_BPS[key]):
            raise HTTPException(409, "TIN fee config on-chain does not match the expected split")
    now_iso = datetime.now(timezone.utc).isoformat()
    fee_mint = operation.get("creationFeeMint") if operation.get("intentType") == "tin_creation" else operation.get("updateFeeMint")
    fee_record = {
        "intentId": intent_id,
        "feeMint": fee_mint or config.TIN_DEFAULT_FEE_MINT,
        "grossAmount": str(gross),
        "verifierAmount": str(split["verifier"]),
        "submitterAmount": str(split["submitter"]),
        "teamAmount": str(split["team"]),
        "reservePoolAmount": str(split["reserve_pool"]),
        "verifierPubkey": verifier,
        "submitterPubkey": submitter,
        "teamPubkey": os.environ.get("TSN_TINS_TEAM_PUBKEY") or os.environ.get("TSN_TINS_TREASURY_PUBKEY"),
        "reservePoolPubkey": os.environ.get("TSN_TINS_RESERVE_POOL_PUBKEY") or os.environ.get("TSN_TINS_BONUS_POOL_PUBKEY"),
        "feeCommitmentTx": body.feeCommitmentTx,
        "feeCommitmentHash": "",
        "status": "committed",
        "createdAt": now_iso,
        "updatedAt": now_iso,
    }
    fee_record["feeCommitmentHash"] = compute_tin_fee_commitment_hash(operation, fee_record)
    fee = TinOperationFeeRecord(**fee_record)
    operation.update({"status": "fee_committed", "submitterCranker": submitter, "feeMetadata": fee.model_dump(), "updatedAt": now_iso})
    await store.hset(k_tin_fees(), intent_id, json.dumps(fee.model_dump()))
    await store.hset(k_tin_operations(), intent_id, json.dumps(operation))
    return TinOperationRecord(**operation)


@router.post("/tin-operations/{intent_id}/submitted", response_model=TinOperationRecord, dependencies=[Depends(require_worker_api_key)])
async def mark_tin_operation_submitted(intent_id: str = ApiPath(...), body: TinOperationStageRequest = ...) -> TinOperationRecord:
    submitter = body.submitterCranker or body.crankerPubkey
    tx_sig = body.txSignature or body.onchainSignature
    if not submitter:
        raise HTTPException(422, "submitter cranker pubkey is required")
    if not tx_sig:
        raise HTTPException(422, "on-chain transaction signature is required")
    store = await get_mempool_store()
    raw = await store.hget(k_tin_operations(), intent_id)
    if not raw:
        raise HTTPException(404, f"TIN operation {intent_id} not found")
    current = json.loads(raw)
    if current.get("submitterCranker") and current.get("submitterCranker") != submitter:
        raise HTTPException(409, "registry work is assigned to a different submitter cranker")
    return await patch_tin_operation(intent_id, {"status": "submitted_onchain", "submitterCranker": submitter, "onchainSignatures": append_unique_signature(current.get("onchainSignatures"), tx_sig)}, {"fee_committed", "submitter_assigned"})


@router.post("/tin-operations/{intent_id}/finalized", response_model=TinOperationRecord, dependencies=[Depends(require_worker_api_key)])
async def mark_tin_operation_finalized(intent_id: str = ApiPath(...), body: TinOperationStageRequest = ...) -> TinOperationRecord:
    patch: dict[str, Any] = {"status": "finalized"}
    tx_sig = body.txSignature or body.onchainSignature
    store = await get_mempool_store()
    raw = await store.hget(k_tin_operations(), intent_id)
    if raw and tx_sig:
        patch["onchainSignatures"] = append_unique_signature(json.loads(raw).get("onchainSignatures"), tx_sig)
    finalized = await patch_tin_operation(intent_id, patch, {"submitted_onchain"})
    await write_shadow_tin_owner(finalized.model_dump())
    await mark_tin_pru_route_finalized(finalized.model_dump())
    return finalized


@router.post("/tin-operations/{intent_id}/failed", response_model=TinOperationRecord, dependencies=[Depends(require_worker_api_key)])
async def mark_tin_operation_failed(intent_id: str = ApiPath(...), body: TinOperationStageRequest = ...) -> TinOperationRecord:
    return await patch_tin_operation(intent_id, {"status": "failed", "failureReason": body.failureReason or body.reason or "TIN operation failed."}, config.TIN_OPERATION_STATUSES - {"finalized"})


@router.post("/tin-operations/{intent_id}/rejected", response_model=TinOperationRecord, dependencies=[Depends(require_worker_api_key)])
async def mark_tin_operation_rejected(intent_id: str = ApiPath(...), body: TinOperationStageRequest = ...) -> TinOperationRecord:
    return await patch_tin_operation(intent_id, {"status": "rejected", "failureReason": body.failureReason or body.reason or "TIN operation rejected."}, config.TIN_OPERATION_STATUSES - {"finalized"})
