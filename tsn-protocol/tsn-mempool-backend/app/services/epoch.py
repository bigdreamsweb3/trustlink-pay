from __future__ import annotations

import asyncio
import base64
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI

from app import config
from app.schemas.network import EpochCloseResult, EpochStatus
from app.store import (
    get_store,
    hget_all_json,
    is_epoch_due,
    is_processing_stale,
    k_claims,
    k_epoch,
    k_intents,
    k_proofs,
    k_recoveries,
    next_close_for_state,
    parse_iso,
    read_epoch_state,
)

SERVICE_STARTED_AT = datetime.now(timezone.utc)


async def build_epoch_status() -> EpochStatus:
    store = await get_store()
    state = await read_epoch_state()
    intent_count = await store.hlen(k_intents())
    claim_count = await store.hlen(k_claims())
    proof_count = await store.hlen(k_proofs())
    recovery_count = await store.hlen(k_recoveries())
    next_close = next_close_for_state(state)
    return EpochStatus(
        epoch_number=state["epoch_number"],
        epoch_started_at=state["started_at"],
        next_close_at=next_close.isoformat(),
        intent_count=int(intent_count),
        claim_count=int(claim_count),
        proof_count=int(proof_count),
        recovery_count=int(recovery_count),
    )


async def commit_epoch_to_github(epoch_number: int, intents: list, claims: list, proofs: list, recoveries: list, closed_at: str) -> str:
    token = os.environ["GITHUB_TOKEN"]

    def count_statuses(items: list[dict]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for item in items:
            status = str(item.get("status") or "recorded")
            counts[status] = counts.get(status, 0) + 1
        return counts

    token_totals: dict[str, dict[str, float | int]] = {}
    for intent in intents:
        mint = str(intent.get("tokenMintAddress") or "unknown")
        row = token_totals.setdefault(mint, {"intent_count": 0, "total_amount": 0.0})
        row["intent_count"] = int(row["intent_count"]) + 1
        row["total_amount"] = float(row["total_amount"]) + float(intent.get("amount") or 0)

    record = {
        "epoch_number": epoch_number,
        "closed_at": closed_at,
        "privacy_model": "aggregate-only-v2",
        "summary": {
            "intent_count": len(intents),
            "claim_count": len(claims),
            "proof_count": len(proofs),
            "recovery_count": len(recoveries),
        },
        "intent_statuses": count_statuses(intents),
        "claim_statuses": count_statuses(claims),
        "recovery_statuses": count_statuses(recoveries),
        "token_totals": token_totals,
    }
    content_b64 = base64.b64encode((json.dumps(record, indent=2) + "\n").encode()).decode()
    date_str = closed_at[:10]
    file_path = f"epochs/epoch-{epoch_number}-{date_str}.json"
    commit_msg = f"epoch {epoch_number} closed at {closed_at} -- {len(intents)} intents, {len(claims)} claims, {len(proofs)} proofs, {len(recoveries)} recoveries"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        check = await client.get(f"{config.GITHUB_API}/repos/{config.GITHUB_REPO}/contents/{file_path}", headers=headers)
        payload: dict[str, object] = {"message": commit_msg, "content": content_b64}
        if check.status_code == 200:
            payload["sha"] = check.json().get("sha")
        resp = await client.put(f"{config.GITHUB_API}/repos/{config.GITHUB_REPO}/contents/{file_path}", json=payload, headers=headers)
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"GitHub commit failed ({resp.status_code}): {resp.text[:400]}")
        return resp.json()["content"]["html_url"]


async def close_epoch_task() -> EpochCloseResult:
    store = await get_store()
    intents = await hget_all_json(k_intents())
    claims = await hget_all_json(k_claims())
    proofs = await hget_all_json(k_proofs())
    recoveries = await hget_all_json(k_recoveries())
    state = await read_epoch_state()
    epoch_number = state["epoch_number"]
    closed_at = datetime.now(timezone.utc).isoformat()
    commit_url = await commit_epoch_to_github(epoch_number, intents, claims, proofs, recoveries, closed_at)
    now = datetime.now(timezone.utc)
    proof_intent_ids = {proof["intent_id"] for proof in proofs}
    terminal_claim_intent_ids = {claim["intentId"] for claim in claims if claim.get("status") in config.TERMINAL_CLAIM_STATUSES}
    active_recovery_payment_ids = {str(recovery.get("paymentId") or "") for recovery in recoveries if recovery.get("status") not in ("completed", "canceled")}
    rollover_intents, pruned_intents = [], []
    for intent in intents:
        status = str(intent.get("status", "pending"))
        retained_for_recovery = str(intent.get("paymentId") or intent["id"]) in active_recovery_payment_ids
        should_prune = not retained_for_recovery and (status in config.TERMINAL_INTENT_STATUSES or intent["id"] in proof_intent_ids or intent["id"] in terminal_claim_intent_ids)
        (pruned_intents if should_prune else rollover_intents).append(intent)
    rollover_intent_ids = {intent["id"] for intent in rollover_intents}
    rollover_claims, pruned_claims = [], []
    for claim in claims:
        status = str(claim.get("status", "pending"))
        if status in config.TERMINAL_CLAIM_STATUSES or claim.get("intentId") not in rollover_intent_ids:
            pruned_claims.append(claim)
            continue
        if is_processing_stale(claim, now):
            claim = {**claim, "status": "pending", "settlementReason": "Rolled over after stale processing lease.", "updatedAt": closed_at}
        rollover_claims.append(claim)
    rollover_recoveries, pruned_recoveries = [], []
    for recovery in recoveries:
        status = str(recovery.get("status", "pending"))
        if status in ("completed", "canceled"):
            pruned_recoveries.append(recovery)
            continue
        if status == "leased":
            recovery = {**recovery, "status": "pending", "assignedCrankerPubkey": None, "leaseExpiresAt": None, "settlementReason": "Recovery lease released during epoch rollover.", "updatedAt": closed_at}
        rollover_recoveries.append(recovery)
    await store.delete(k_intents(), k_claims(), k_proofs(), k_recoveries())
    if rollover_intents:
        await store.hset(k_intents(), mapping={intent["id"]: json.dumps(intent) for intent in rollover_intents})
    if rollover_claims:
        await store.hset(k_claims(), mapping={claim["id"]: json.dumps(claim) for claim in rollover_claims})
    if rollover_recoveries:
        await store.hset(k_recoveries(), mapping={recovery["id"]: json.dumps(recovery) for recovery in rollover_recoveries})
    new_epoch = epoch_number + 1
    await store.set(k_epoch(), json.dumps({"epoch_number": new_epoch, "started_at": closed_at}))
    return EpochCloseResult(
        epoch_number=epoch_number,
        intents_archived=len(intents),
        claims_archived=len(claims),
        proofs_archived=len(proofs),
        recoveries_archived=len(recoveries),
        intents_rolled_over=len(rollover_intents),
        claims_rolled_over=len(rollover_claims),
        intents_pruned=len(pruned_intents),
        claims_pruned=len(pruned_claims),
        proofs_pruned=len(proofs),
        recoveries_rolled_over=len(rollover_recoveries),
        recoveries_pruned=len(pruned_recoveries),
        github_commit_url=commit_url,
        new_epoch_number=new_epoch,
        message=f"Epoch {epoch_number} archived. Epoch {new_epoch} started. Rolled over {len(rollover_intents)} intents, {len(rollover_claims)} claims, and {len(rollover_recoveries)} recoveries.",
    )


async def epoch_scheduler():
    while True:
        try:
            state = await read_epoch_state()
            next_close = next_close_for_state(state)
            sleep_for = max(1, int((next_close - datetime.now(timezone.utc)).total_seconds()))
            await asyncio.sleep(sleep_for)
            config.logger.info("Auto epoch close triggered")
            result = await close_epoch_task()
            config.logger.info("Auto epoch closed: %s; rolled_over=%d/%d", result.github_commit_url, result.intents_rolled_over, result.claims_rolled_over)
        except asyncio.CancelledError:
            raise
        except Exception:
            config.logger.exception("Auto epoch close failed; retrying in 60 seconds")
            await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_store()
    if not config.MEMPOOL_API_KEY:
        config.logger.warning("MEMPOOL_API_KEY is not configured; protected worker endpoints are open for local development")
    if not config.TSN_ROUTE_ENCRYPTION_SECRET_KEY or not config.TSN_PERMIT_SIGNER_SECRET_KEY:
        config.logger.warning("TSN private permit issuance is disabled until both routing and permit signer secrets are configured")
    if is_epoch_due(await read_epoch_state()):
        config.logger.info("Epoch was overdue on startup; closing before accepting work")
        try:
            result = await close_epoch_task()
            config.logger.info("Startup epoch close completed: %s", result.message)
        except Exception:
            config.logger.exception("Startup epoch close failed; live work remains available")
    task = asyncio.create_task(epoch_scheduler())
    config.logger.info("TSN Mempool started on port %d (epoch every %dh)", config.PORT, config.EPOCH_HOURS)
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    if config._store:
        await config._store.aclose()
