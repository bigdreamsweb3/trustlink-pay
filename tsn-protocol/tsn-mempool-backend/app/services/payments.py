from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import HTTPException

from app import config
from app.schemas.network import RecoveryWorkItem
from app.schemas.payments import MempoolIntent, ProofOfPayment, PublicMempoolIntent
from app.solana import read_public_vault_liquidity_cached
from app.store import get_mempool_store, hget_all_json, k_crankers, k_recoveries


def public_intent(intent: MempoolIntent | dict[str, Any]) -> PublicMempoolIntent:
    data = intent.model_dump() if isinstance(intent, MempoolIntent) else intent
    return PublicMempoolIntent(**data)


def intent_submission_work(intent: MempoolIntent) -> MempoolIntent:
    data = intent.model_dump()
    encrypted = data.get("encryptedSettlementToken")
    if isinstance(encrypted, dict):
        data["encryptedSettlementToken"] = {
            **encrypted,
            "ciphertextBase64": "",
            "nonceBase64": "",
            "ephemeralPublicKeyBase64": "",
        }
    return MempoolIntent(**data)


def select_pru_for_payment(route: dict[str, Any], intent: dict[str, Any], token_mint: str) -> dict[str, Any]:
    prus = [pru for pru in route.get("prus", []) if str(pru.get("state") or "ACTIVE") != "SWEPT"]
    if not prus:
        raise HTTPException(409, "Recipient TIN has no active PRU route")
    seed = hashlib.sha256("|".join([
        "TSN_V1_ALLOCATION_SEED",
        str(intent.get("transferId") or intent.get("id") or intent.get("paymentId")),
        str(route["tin"]),
        str(token_mint),
    ]).encode("utf-8")).hexdigest()
    ranked = sorted(
        prus,
        key=lambda pru: hashlib.sha256("|".join([
            "TSN_V1_PRU_WEIGHT",
            seed,
            str(pru.get("publicKeyHex") or pru.get("publicKey")),
            str(int(pru.get("index") or 0)),
        ]).encode("utf-8")).hexdigest(),
    )
    return ranked[0]


def recovery_priority(item: dict[str, Any], now: Optional[datetime] = None, settlement_liquidity_ui: Optional[float] = None) -> float:
    current = now or datetime.now(timezone.utc)
    posted_at = datetime.fromisoformat(str(item["postedAt"]).replace("Z", "+00:00"))
    age_hours = max(0.0, (current - posted_at).total_seconds() / 3600)
    amount = max(0.0, float(item.get("amount") or 0))
    liquidity_boost = 0.0
    if settlement_liquidity_ui is not None:
        deficit = max(0.0, config.RECOVERY_LOW_LIQUIDITY_UI - settlement_liquidity_ui)
        liquidity_boost = (deficit * 100.0) + (500.0 if settlement_liquidity_ui < config.RECOVERY_LOW_LIQUIDITY_UI else 0.0)
    return round((amount * 10.0) + age_hours + liquidity_boost, 6)


def recovery_is_eligible(item: dict[str, Any], current_epoch: int, settlement_liquidity_ui: Optional[float]) -> bool:
    if int(item.get("epoch") or 0) < current_epoch:
        return True
    return config.RECOVERY_LOW_LIQUIDITY_UI > 0 and settlement_liquidity_ui is not None and settlement_liquidity_ui < config.RECOVERY_LOW_LIQUIDITY_UI


async def settlement_operator_liquidity() -> dict[str, float]:
    try:
        heartbeats, vaults = await asyncio.gather(
            hget_all_json(k_crankers()),
            read_public_vault_liquidity_cached(),
        )
    except Exception as exc:
        config.logger.warning("Recovery liquidity snapshot unavailable: %s", exc)
        return {}
    cranker_by_operator = {
        str(record["operator_pubkey"]): str(record["cranker_pubkey"])
        for record in heartbeats
        if record.get("operator_pubkey") and record.get("cranker_pubkey")
    }
    liquidity_by_cranker: dict[str, float] = {}
    for vault in vaults:
        cranker = vault.get("cranker")
        if not cranker:
            continue
        liquidity_by_cranker[str(cranker)] = liquidity_by_cranker.get(str(cranker), 0.0) + max(0.0, float(vault.get("total_liquidity") or 0))
    return {operator: liquidity_by_cranker.get(cranker, 0.0) for operator, cranker in cranker_by_operator.items()}


async def create_recovery_work_from_proof(intent: dict[str, Any], proof: ProofOfPayment) -> Optional[RecoveryWorkItem]:
    required = {
        "transferId": intent.get("transferId"),
        "settlementPaymentIntentId": intent.get("settlementPaymentIntentId"),
        "settlementVault": intent.get("settlementVault"),
        "settlementTokenAccount": intent.get("settlementTokenAccount"),
        "tokenMintAddress": intent.get("tokenMintAddress"),
    }
    missing = [name for name, value in required.items() if value in (None, "")]
    if missing:
        config.logger.warning("Recovery work not created for intent=%s; missing=%s", intent.get("id"), ",".join(missing))
        return None
    store = await get_mempool_store()
    for existing in await hget_all_json(k_recoveries()):
        if existing.get("paymentId") == intent.get("paymentId"):
            return RecoveryWorkItem(**existing)
    state = await __import__("app.store", fromlist=["read_epoch_state"]).read_epoch_state()
    now_iso = datetime.now(timezone.utc).isoformat()
    raw = {
        "id": str(uuid4()) if int(intent.get("privacyVersion") or 1) >= 2 else str(intent["id"]),
        "paymentId": str(intent["paymentId"]),
        "transferId": str(required["transferId"]),
        "paymentIntentId": str(required["settlementPaymentIntentId"]),
        "settlementVault": str(required["settlementVault"]),
        "settlementTokenAccount": str(required["settlementTokenAccount"]),
        "tokenMintAddress": str(required["tokenMintAddress"]),
        "settlementCrankerPubkey": proof.cranker_pubkey,
        "privacyVersion": int(intent.get("privacyVersion") or 1),
        "amount": float(intent.get("amount") or 0),
        "epoch": int(intent.get("settlementEpoch") or state["epoch_number"]),
        "rewardLamports": config.RECOVERY_REWARD_LAMPORTS,
        "priorityScore": 0.0,
        "status": "pending",
        "assignedCrankerPubkey": None,
        "leaseExpiresAt": None,
        "recoveryTxSig": None,
        "settlementReason": "Settlement paid; recovery waits for epoch close unless smart recovery detects low settlement liquidity.",
        "postedAt": now_iso,
        "updatedAt": now_iso,
    }
    raw["priorityScore"] = recovery_priority(raw)
    work = RecoveryWorkItem(**raw)
    await store.hset(k_recoveries(), work.id, json.dumps(work.model_dump()))
    config.logger.info("Recovery queued: intent=%s transfer=%s settlement_cranker=%s", work.id, work.transferId, work.settlementCrankerPubkey)
    return work
