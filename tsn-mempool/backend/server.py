"""
TSN Shared Mempool — self-hosted version.

Requirements:
    pip install fastapi uvicorn[standard] httpx redis[asyncio] python-dotenv

Environment variables (create a .env file):
    GITHUB_TOKEN=<your GitHub PAT with Contents:Write on tsn-epoch-records>
    REDIS_URL=redis://localhost:6379
    PORT=8000
    EPOCH_HOURS=7
"""

import asyncio
import base64
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Literal, Optional
from uuid import uuid4

import httpx
import redis.asyncio as aioredis
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("tsn-mempool")

# ── Config ───────────────────────────────────────────────────────────────────
GITHUB_REPO     = "bigdreamsweb3/tsn-epoch-records"
GITHUB_API      = "https://api.github.com"
REDIS_URL       = os.environ.get("REDIS_URL", "redis://localhost:6379")
EPOCH_HOURS     = int(os.environ.get("EPOCH_HOURS", "7"))
EPOCH_SECS      = EPOCH_HOURS * 60 * 60
PORT            = int(os.environ.get("PORT", "8000"))
MEMPOOL_NS      = "tsn"          # Redis key namespace

# ── Redis helpers ─────────────────────────────────────────────────────────────
_redis: Optional[aioredis.Redis] = None

async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis

def k_intents() -> str: return f"{MEMPOOL_NS}:intents"
def k_claims()  -> str: return f"{MEMPOOL_NS}:claims"
def k_proofs()  -> str: return f"{MEMPOOL_NS}:proofs"
def k_epoch()   -> str: return f"{MEMPOOL_NS}:epoch"


async def hget_all_json(key: str) -> list:
    r = await get_redis()
    raw: dict = await r.hgetall(key)
    return [json.loads(v) for v in raw.values()]


async def read_epoch_state() -> dict:
    r = await get_redis()
    raw = await r.get(k_epoch())
    if raw:
        return json.loads(raw)
    now_iso = datetime.now(timezone.utc).isoformat()
    state = {"epoch_number": 1, "started_at": now_iso}
    await r.set(k_epoch(), json.dumps(state))
    return state

# ── Models ────────────────────────────────────────────────────────────────────
class CreateIntentRequest(BaseModel):
    paymentId:        str           = Field(..., description="Unique payment ID")
    intentSeedHash:   str           = Field(..., description="SHA-256 hex of paymentId")
    recipientHash:    str           = Field(..., description="Hashed recipient")
    tokenMintAddress: str           = Field(..., description="SPL token mint address")
    amount:           float         = Field(..., description="Payment amount")
    underlyingPayment: Optional[str] = Field(None)
    source:            Optional[str] = Field(None)

class MempoolIntent(CreateIntentRequest):
    id:                   str
    status:               str           = "pending"
    settlementResolution: Optional[str] = None
    settlementReason:     Optional[str] = None
    postedAt:             str
    updatedAt:            str

class PostClaimRequest(BaseModel):
    paymentId:         str           = Field(...)
    intentId:          str           = Field(...)
    recipientHash:     str           = Field(...)
    destinationWallet: str           = Field(...)
    autoclaim:         bool          = Field(False)
    source:            Optional[str] = Field(None)

class MempoolClaimRequest(PostClaimRequest):
    id:               str
    status:           str           = "pending"
    settlementReason: Optional[str] = None
    postedAt:         str
    updatedAt:        str

class ProofOfPayment(BaseModel):
    intent_id:         str           = Field(...)
    timestamp:         str           = Field(...)
    cranker_pubkey:    str           = Field(...)
    proof_tx:          str           = Field(...)
    encrypted_payload: Optional[str] = Field(None)

class WorkItem(BaseModel):
    intent:       MempoolIntent
    claimRequest: MempoolClaimRequest

class UpdateStatusRequest(BaseModel):
    status:               str           = Field(...)
    settlementResolution: Optional[str] = Field(None)
    settlementReason:     Optional[str] = Field(None)

class EpochStatus(BaseModel):
    epoch_number:    int
    epoch_started_at: str
    next_close_at:   str
    intent_count:    int
    claim_count:     int
    proof_count:     int

class EpochCloseResult(BaseModel):
    epoch_number:     int
    intents_archived: int
    claims_archived:  int
    proofs_archived:  int
    github_commit_url: str
    new_epoch_number:  int
    message:           str

class MempoolStatusRequest(BaseModel):
    action: Optional[str] = Field(default="status")

class MempoolStatusResponse(BaseModel):
    status: str = "ok"
    epoch:  EpochStatus

# ── GitHub archive ────────────────────────────────────────────────────────────
async def commit_epoch_to_github(
    epoch_number: int,
    intents: list, claims: list, proofs: list,
    closed_at: str,
) -> str:
    token = os.environ["GITHUB_TOKEN"]
    record = {
        "epoch_number": epoch_number,
        "closed_at":    closed_at,
        "summary": {
            "intent_count": len(intents),
            "claim_count":  len(claims),
            "proof_count":  len(proofs),
        },
        "intents":        intents,
        "claim_requests": claims,
        "proofs":         proofs,
    }
    content_b64 = base64.b64encode(
        (json.dumps(record, indent=2) + "\n").encode()
    ).decode()
    date_str  = closed_at[:10]
    file_path = f"epochs/epoch-{epoch_number}-{date_str}.json"
    commit_msg = (
        f"epoch {epoch_number} closed at {closed_at} -- "
        f"{len(intents)} intents, {len(claims)} claims, {len(proofs)} proofs"
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        check = await client.get(
            f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}",
            headers=headers,
        )
        payload: dict[str, Any] = {"message": commit_msg, "content": content_b64}
        if check.status_code == 200:
            payload["sha"] = check.json().get("sha")
        resp = await client.put(
            f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}",
            json=payload, headers=headers,
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"GitHub commit failed ({resp.status_code}): {resp.text[:400]}")
        return resp.json()["content"]["html_url"]


async def close_epoch_task() -> EpochCloseResult:
    r = await get_redis()
    intents = await hget_all_json(k_intents())
    claims  = await hget_all_json(k_claims())
    proofs  = await hget_all_json(k_proofs())
    state   = await read_epoch_state()
    epoch_number = state["epoch_number"]
    closed_at    = datetime.now(timezone.utc).isoformat()

    logger.info("Closing epoch %d: %d intents, %d claims, %d proofs",
                epoch_number, len(intents), len(claims), len(proofs))

    commit_url = await commit_epoch_to_github(
        epoch_number, intents, claims, proofs, closed_at
    )

    await r.delete(k_intents())
    await r.delete(k_claims())
    await r.delete(k_proofs())
    new_epoch = epoch_number + 1
    await r.set(k_epoch(), json.dumps({
        "epoch_number": new_epoch, "started_at": closed_at,
    }))
    return EpochCloseResult(
        epoch_number=epoch_number,
        intents_archived=len(intents), claims_archived=len(claims),
        proofs_archived=len(proofs), github_commit_url=commit_url,
        new_epoch_number=new_epoch,
        message=f"Epoch {epoch_number} archived. Epoch {new_epoch} started.",
    )

# ── Background scheduler ──────────────────────────────────────────────────────
async def epoch_scheduler():
    while True:
        await asyncio.sleep(EPOCH_SECS)
        logger.info("Auto epoch close triggered")
        result = await close_epoch_task()
        logger.info("Auto epoch closed: %s", result.github_commit_url)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise Redis connection
    await get_redis()
    task = asyncio.create_task(epoch_scheduler())
    logger.info("TSN Mempool started on port %d (epoch every %dh)", PORT, EPOCH_HOURS)
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    if _redis:
        await _redis.aclose()

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="TSN Mempool",
    description=(
        "Shared off-chain settlement queue for the Transfer Settlement Network. "
        f"Epoch every {EPOCH_HOURS}h — archives to GitHub (bigdreamsweb3/tsn-epoch-records)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Allow frontend to call this API from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Root ──────────────────────────────────────────────────────────────────────
@app.post("/", response_model=MempoolStatusResponse)
async def mempool_status(request: MempoolStatusRequest) -> MempoolStatusResponse:
    """Mempool health check and current epoch info."""
    r = await get_redis()
    state        = await read_epoch_state()
    intent_count = await r.hlen(k_intents())
    claim_count  = await r.hlen(k_claims())
    proof_count  = await r.hlen(k_proofs())
    started_dt   = datetime.fromisoformat(state["started_at"])
    next_close   = datetime.fromtimestamp(
        started_dt.timestamp() + EPOCH_SECS, tz=timezone.utc
    )
    return MempoolStatusResponse(
        status="ok",
        epoch=EpochStatus(
            epoch_number    = state["epoch_number"],
            epoch_started_at= state["started_at"],
            next_close_at   = next_close.isoformat(),
            intent_count    = int(intent_count),
            claim_count     = int(claim_count),
            proof_count     = int(proof_count),
        ),
    )

# ── Intents ───────────────────────────────────────────────────────────────────
@app.post("/intents", response_model=MempoolIntent)
async def post_intent(req: CreateIntentRequest) -> MempoolIntent:
    """Submit a payment intent. Idempotent by paymentId."""
    r = await get_redis()
    existing = await r.hget(k_intents(), req.paymentId)
    if existing:
        return MempoolIntent(**json.loads(existing))
    now = datetime.now(timezone.utc).isoformat()
    intent = MempoolIntent(**req.model_dump(), id=req.paymentId,
                           status="pending", postedAt=now, updatedAt=now)
    await r.hset(k_intents(), req.paymentId, json.dumps(intent.model_dump()))
    logger.info("Intent posted: %s", intent.id)
    return intent

@app.get("/intents", response_model=list[MempoolIntent])
async def list_intents(status: Optional[str] = Query(None)) -> list[MempoolIntent]:
    items = [MempoolIntent(**i) for i in await hget_all_json(k_intents())]
    if status:
        items = [i for i in items if i.status == status]
    return sorted(items, key=lambda i: i.postedAt)

@app.patch("/intents/{intent_id}/status", response_model=MempoolIntent)
async def update_intent_status(
    intent_id: str = Path(...),
    body: UpdateStatusRequest = ...,
) -> MempoolIntent:
    r = await get_redis()
    raw = await r.hget(k_intents(), intent_id)
    if not raw:
        raise HTTPException(404, f"Intent {intent_id} not found")
    data = json.loads(raw)
    data.update({"status": body.status, "updatedAt": datetime.now(timezone.utc).isoformat()})
    if body.settlementResolution is not None:
        data["settlementResolution"] = body.settlementResolution
    if body.settlementReason is not None:
        data["settlementReason"] = body.settlementReason
    await r.hset(k_intents(), intent_id, json.dumps(data))
    return MempoolIntent(**data)

# ── Claim Requests ────────────────────────────────────────────────────────────
@app.post("/claim-requests", response_model=MempoolClaimRequest)
async def post_claim_request(req: PostClaimRequest) -> MempoolClaimRequest:
    """Post a claim request. Idempotent — returns existing active claim for intent."""
    r = await get_redis()
    for c in await hget_all_json(k_claims()):
        if c["intentId"] == req.intentId and c["status"] not in ("failed", "canceled"):
            return MempoolClaimRequest(**c)
    now = datetime.now(timezone.utc).isoformat()
    claim = MempoolClaimRequest(**req.model_dump(), id=str(uuid4()),
                                status="pending", postedAt=now, updatedAt=now)
    await r.hset(k_claims(), claim.id, json.dumps(claim.model_dump()))
    logger.info("Claim posted: %s for intent %s", claim.id, req.intentId)
    return claim

@app.get("/claim-requests", response_model=list[MempoolClaimRequest])
async def list_claim_requests(
    intent_id: Optional[str] = Query(None),
    status:    Optional[str] = Query(None),
) -> list[MempoolClaimRequest]:
    items = [MempoolClaimRequest(**c) for c in await hget_all_json(k_claims())]
    if intent_id: items = [c for c in items if c.intentId == intent_id]
    if status:    items = [c for c in items if c.status   == status]
    return sorted(items, key=lambda c: c.postedAt)

@app.patch("/claim-requests/{claim_id}/status", response_model=MempoolClaimRequest)
async def update_claim_status(
    claim_id: str = Path(...),
    body: UpdateStatusRequest = ...,
) -> MempoolClaimRequest:
    r = await get_redis()
    raw = await r.hget(k_claims(), claim_id)
    if not raw:
        raise HTTPException(404, f"Claim {claim_id} not found")
    data = json.loads(raw)
    data.update({"status": body.status, "updatedAt": datetime.now(timezone.utc).isoformat()})
    if body.settlementReason is not None:
        data["settlementReason"] = body.settlementReason
    await r.hset(k_claims(), claim_id, json.dumps(data))
    return MempoolClaimRequest(**data)

# ── Proofs of Payment ─────────────────────────────────────────────────────────
@app.post("/proofs", response_model=ProofOfPayment)
async def post_proof(proof: ProofOfPayment) -> ProofOfPayment:
    """Cranker submits Proof of Payment. Auto-advances intent to 'executed'."""
    r = await get_redis()
    await r.hset(k_proofs(), proof.intent_id, json.dumps(proof.model_dump()))
    # Auto-advance intent: claimed → executed
    raw = await r.hget(k_intents(), proof.intent_id)
    if raw:
        data = json.loads(raw)
        if data.get("status") == "claimed":
            data["status"]    = "executed"
            data["updatedAt"] = datetime.now(timezone.utc).isoformat()
            await r.hset(k_intents(), proof.intent_id, json.dumps(data))
    logger.info("Proof posted: intent=%s cranker=%s", proof.intent_id, proof.cranker_pubkey)
    return proof

@app.get("/proofs", response_model=list[ProofOfPayment])
async def list_proofs(
    intent_id:     Optional[str] = Query(None),
    cranker_pubkey: Optional[str] = Query(None),
) -> list[ProofOfPayment]:
    items = [ProofOfPayment(**p) for p in await hget_all_json(k_proofs())]
    if intent_id:     items = [p for p in items if p.intent_id     == intent_id]
    if cranker_pubkey: items = [p for p in items if p.cranker_pubkey == cranker_pubkey]
    return sorted(items, key=lambda p: p.timestamp)

# ── Work queue ────────────────────────────────────────────────────────────────
@app.get("/work", response_model=list[WorkItem])
async def list_pending_work(
    limit: int = Query(50, ge=1, le=500)
) -> list[WorkItem]:
    """Pending work items (intent + claim pairs) for crankers to pick up."""
    intents = await hget_all_json(k_intents())
    claims  = await hget_all_json(k_claims())
    intent_map = {i["id"]: i for i in intents}
    pending = sorted(
        [c for c in claims if c["status"] == "pending"],
        key=lambda c: c["postedAt"],
    )[:limit]
    result = []
    for c in pending:
        intent = intent_map.get(c["intentId"])
        if intent and intent["status"] == "pending":
            result.append(WorkItem(
                intent=MempoolIntent(**intent),
                claimRequest=MempoolClaimRequest(**c),
            ))
    return result

# ── Epoch management ──────────────────────────────────────────────────────────
@app.get("/epoch/status", response_model=EpochStatus)
async def get_epoch_status() -> EpochStatus:
    r = await get_redis()
    state        = await read_epoch_state()
    intent_count = await r.hlen(k_intents())
    claim_count  = await r.hlen(k_claims())
    proof_count  = await r.hlen(k_proofs())
    started_dt   = datetime.fromisoformat(state["started_at"])
    next_close   = datetime.fromtimestamp(
        started_dt.timestamp() + EPOCH_SECS, tz=timezone.utc
    )
    return EpochStatus(
        epoch_number    = state["epoch_number"],
        epoch_started_at= state["started_at"],
        next_close_at   = next_close.isoformat(),
        intent_count    = int(intent_count),
        claim_count     = int(claim_count),
        proof_count     = int(proof_count),
    )

@app.post("/epoch/close", response_model=EpochCloseResult)
async def close_epoch() -> EpochCloseResult:
    """Manually close the current epoch — archive to GitHub and reset mempool."""
    logger.info("Manual epoch close triggered")
    return await close_epoch_task()

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
