#!/usr/bin/env python3
"""Autonomous TSN cranker scheduler for intent, settlement, and recovery work.

This daemon intentionally uses only commitment-registry fields for settlement
verification. It never writes sender wallets, recipient wallets, or decrypted
settlement tokens to the public registry.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

TOKEN_ALGORITHM = "TSN-HKDF-SHA256-STREAM-HMAC"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def b64url_decode(value: str) -> bytes:
    padded = value.replace("-", "+").replace("_", "/") + "=" * ((4 - len(value) % 4) % 4)
    return base64.b64decode(padded)


def b64url_encode(value: bytes) -> str:
    return base64.b64encode(value).decode().rstrip("=").replace("+", "-").replace("/", "_")


def sha256_hex(value: str | bytes) -> str:
    if isinstance(value, str):
        value = value.encode()
    return hashlib.sha256(value).hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def normalize_master_key() -> bytes:
    raw = os.environ.get("TSN_SETTLEMENT_TOKEN_MASTER_KEY", "")
    if not raw:
        raise RuntimeError("TSN_SETTLEMENT_TOKEN_MASTER_KEY is required for OTDT settlement decryption")
    raw = raw.strip()
    if len(raw) == 64 and all(char in "0123456789abcdefABCDEF" for char in raw):
        return bytes.fromhex(raw)
    try:
        decoded = base64.b64decode(raw)
        if len(decoded) >= 32:
            return decoded
    except Exception:
        pass
    return bytes.fromhex(sha256_hex(raw))


def hmac_sha256(key: bytes, value: str | bytes) -> bytes:
    if isinstance(value, str):
        value = value.encode()
    return hmac.new(key, value, hashlib.sha256).digest()


def derive_keys(master_key: bytes, transfer_id: str, salt: str, dna_hash: str) -> tuple[bytes, bytes]:
    prk = hmac_sha256(master_key, f"tsn-settlement:{transfer_id}:{salt}")
    return hmac_sha256(prk, f"enc:{dna_hash}"), hmac_sha256(prk, f"mac:{dna_hash}")


def stream_xor(data: bytes, key: bytes, nonce: bytes) -> bytes:
    output = bytearray(len(data))
    offset = 0
    counter = 0
    while offset < len(data):
        block = hmac_sha256(key, nonce + counter.to_bytes(4, "big"))
        for byte in block:
            if offset >= len(data):
                break
            output[offset] = data[offset] ^ byte
            offset += 1
        counter += 1
    return bytes(output)


def decrypt_settlement_token(encrypted_token: str, transfer_id: str, commitment_hash: str, dna_hash: str) -> dict[str, Any]:
    envelope = json.loads(b64url_decode(encrypted_token).decode())
    if envelope.get("algorithm") != TOKEN_ALGORITHM:
        raise RuntimeError("Unsupported settlement token algorithm")
    if envelope.get("authorizedCrankerDnaHash") != dna_hash:
        raise RuntimeError("Cranker DNA is not authorized for this settlement token")
    aad = b64url_decode(envelope["aad"]).decode()
    if sha256_hex(aad) != envelope.get("aadHash"):
        raise RuntimeError("Settlement token AAD hash mismatch")
    enc_key, mac_key = derive_keys(normalize_master_key(), transfer_id, envelope["salt"], dna_hash)
    nonce = b64url_decode(envelope["nonce"])
    ciphertext = b64url_decode(envelope["ciphertext"])
    tag = hmac_sha256(mac_key, aad.encode() + nonce + ciphertext)
    if not hmac.compare_digest(tag, b64url_decode(envelope["tag"])):
        raise RuntimeError("Settlement token authentication failed")
    plaintext = json.loads(stream_xor(ciphertext, enc_key, nonce).decode())
    if plaintext.get("transferId") != transfer_id:
        raise RuntimeError("Settlement token transfer mismatch")
    if sha256_hex(canonical_json(plaintext)) != commitment_hash:
        raise RuntimeError("Settlement token commitment mismatch")
    return plaintext


@dataclass
class SchedulerConfig:
    mempool_file: Path
    cranker_pubkey: str
    dna_hash: str
    poll_seconds: float
    low_liquidity_threshold: float


class TsnScheduler:
    def __init__(self, config: SchedulerConfig):
        self.config = config

    def load(self) -> dict[str, Any]:
        if not self.config.mempool_file.exists():
            return self.normalize({"intents": [], "claimRequests": [], "proofs": []})
        with self.config.mempool_file.open("r", encoding="utf8") as handle:
            return self.normalize(json.load(handle))

    def save(self, state: dict[str, Any]) -> None:
        self.config.mempool_file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.config.mempool_file.with_suffix(".tmp")
        with tmp.open("w", encoding="utf8") as handle:
            json.dump(self.normalize(state), handle, indent=2)
            handle.write("\n")
        tmp.replace(self.config.mempool_file)

    def normalize(self, state: dict[str, Any]) -> dict[str, Any]:
        state.setdefault("intents", [])
        state.setdefault("claimRequests", [])
        state.setdefault("proofs", [])
        state.setdefault("commitmentRegistry", [])
        state.setdefault("claimPointLedger", [])
        state.setdefault("claimLeases", [])
        state.setdefault("recoveryQueue", [])
        state.setdefault(
            "liquidityMetrics",
            {
                "activeLiquidity": float(os.environ.get("TSN_ACTIVE_LIQUIDITY", "0")),
                "pendingIntentAmount": 0,
                "vaultBalance": float(os.environ.get("TSN_VAULT_BALANCE", "0")),
                "settlementVelocity": 0,
                "liquidityConsumptionRate": 0,
                "lowLiquidityThreshold": self.config.low_liquidity_threshold,
                "updatedAt": now_iso(),
            },
        )
        return state

    def ledger(self, state: dict[str, Any]) -> dict[str, Any]:
        for entry in state["claimPointLedger"]:
            if entry["crankerPubkey"] == self.config.cranker_pubkey:
                return entry
        entry = {"crankerPubkey": self.config.cranker_pubkey, "earned": 0, "available": 0, "leased": 0, "lastIntentWorkAt": None}
        state["claimPointLedger"].append(entry)
        return entry

    def registry_entry(self, state: dict[str, Any], transfer_id: str) -> dict[str, Any] | None:
        return next((entry for entry in state["commitmentRegistry"] if entry["transferId"] == transfer_id), None)

    def refresh_metrics(self, state: dict[str, Any]) -> dict[str, Any]:
        metrics = state["liquidityMetrics"]
        pending = sum(float(intent.get("amount") or 0) for intent in state["intents"] if intent.get("status") in {"pending", "escrowed", "onchain", "claimed"})
        active = max(0.0, float(metrics.get("activeLiquidity") or 0))
        executed = sum(1 for intent in state["intents"] if intent.get("status") in {"executed", "settled"})
        metrics.update(
            {
                "pendingIntentAmount": pending,
                "settlementVelocity": executed,
                "liquidityConsumptionRate": pending / active if active else pending,
                "lowLiquidityThreshold": self.config.low_liquidity_threshold,
                "updatedAt": now_iso(),
            }
        )
        return metrics

    def verify_intents(self, state: dict[str, Any]) -> int:
        completed = 0
        for intent in state["intents"]:
            if intent.get("status") != "pending":
                continue
            if not intent.get("encryptedSettlementToken") or not intent.get("settlementTokenCommitmentHash"):
                intent.update({"status": "failed", "settlementReason": "missing settlement token commitment", "updatedAt": now_iso()})
                continue
            if not self.registry_entry(state, intent["id"]):
                state["commitmentRegistry"].append(
                    {
                        "transferId": intent["id"],
                        "encryptedSettlementToken": intent["encryptedSettlementToken"],
                        "commitmentHash": intent["settlementTokenCommitmentHash"],
                        "timestamp": intent.get("postedAt") or now_iso(),
                        "epoch": intent.get("epoch", int(time.time() // 3600)),
                        "recoverable": False,
                        "intentVerifierPubkey": self.config.cranker_pubkey,
                        "updatedAt": now_iso(),
                    }
                )
            intent.update({"status": "escrowed", "assignedCrankerPubkey": self.config.cranker_pubkey, "updatedAt": now_iso()})
            ledger = self.ledger(state)
            ledger["earned"] += 1
            ledger["available"] += 1
            ledger["lastIntentWorkAt"] = now_iso()
            completed += 1
        return completed

    def acquire_lease(self, state: dict[str, Any], transfer_id: str) -> dict[str, Any] | None:
        entry = self.registry_entry(state, transfer_id)
        if not entry or entry.get("recoverable") or entry.get("otdtHash"):
            return None
        for lease in state["claimLeases"]:
            if lease["transferId"] == transfer_id and lease["status"] == "active" and parse_iso(lease["expiresAt"]) > datetime.now(timezone.utc):
                return lease if lease["crankerPubkey"] == self.config.cranker_pubkey else None
        ledger = self.ledger(state)
        if ledger["available"] < 1:
            return None
        ledger["available"] -= 1
        ledger["leased"] += 1
        issued_at = datetime.now(timezone.utc)
        lease_id = str(uuid.uuid4())
        otdt_hash = sha256_hex(f"{transfer_id}:{lease_id}:{self.config.cranker_pubkey}:{entry['commitmentHash']}:{uuid.uuid4().hex}")
        lease = {
            "id": lease_id,
            "transferId": transfer_id,
            "crankerPubkey": self.config.cranker_pubkey,
            "status": "active",
            "pointsSpent": 1,
            "otdtHash": otdt_hash,
            "issuedAt": issued_at.isoformat().replace("+00:00", "Z"),
            "expiresAt": (issued_at + timedelta(minutes=10)).isoformat().replace("+00:00", "Z"),
        }
        entry["otdtHash"] = otdt_hash
        entry["updatedAt"] = now_iso()
        state["claimLeases"].append(lease)
        return lease

    def settle_claims(self, state: dict[str, Any]) -> int:
        completed = 0
        for claim in state["claimRequests"]:
            if claim.get("status") != "pending":
                continue
            intent = next((item for item in state["intents"] if item["id"] == claim["intentId"] and item.get("status") in {"escrowed", "onchain", "claimed"}), None)
            if not intent:
                continue
            entry = self.registry_entry(state, intent["id"])
            lease = self.acquire_lease(state, intent["id"])
            if not entry or not lease:
                continue
            token = decrypt_settlement_token(intent["encryptedSettlementToken"], intent["id"], entry["commitmentHash"], self.config.dna_hash)
            settlement_commitment = sha256_hex(canonical_json({"transferId": token["transferId"], "commitmentHash": entry["commitmentHash"], "leaseId": lease["id"], "crankerPubkey": self.config.cranker_pubkey}))
            proof_tx = f"simulated-settlement-{uuid.uuid4().hex}"
            entry.update({"recoverable": True, "settlementCommitmentHash": settlement_commitment, "settlementProofTx": proof_tx, "updatedAt": now_iso()})
            intent.update({"status": "executed", "proofTxSig": proof_tx, "claimLeaseId": lease["id"], "updatedAt": now_iso()})
            claim.update({"status": "completed", "claimLeaseId": lease["id"], "updatedAt": now_iso()})
            lease.update({"status": "completed", "completedAt": now_iso()})
            state["proofs"].append({"intent_id": intent["id"], "timestamp": now_iso(), "cranker_pubkey": self.config.cranker_pubkey, "proof_tx": proof_tx, "settlement_commitment_hash": settlement_commitment, "otdt_hash": lease["otdtHash"]})
            self.enqueue_recovery(state, intent, entry)
            completed += 1
        return completed

    def enqueue_recovery(self, state: dict[str, Any], intent: dict[str, Any], entry: dict[str, Any]) -> None:
        if any(job["transferId"] == intent["id"] for job in state["recoveryQueue"]):
            return
        metrics = self.refresh_metrics(state)
        amount = float(intent.get("amount") or 0)
        deficit = max(0.0, self.config.low_liquidity_threshold - float(metrics.get("activeLiquidity") or 0))
        priority = round(deficit * 10 + float(metrics.get("pendingIntentAmount") or 0) * 2 + amount, 6)
        state["recoveryQueue"].append(
            {
                "id": str(uuid.uuid4()),
                "transferId": intent["id"],
                "epoch": entry["epoch"],
                "recoverableAmount": amount,
                "vaultSource": f"commitment:{entry['commitmentHash']}",
                "recoveryReward": round(amount * 0.02, 9),
                "priorityScore": priority,
                "status": "open",
                "createdAt": now_iso(),
                "updatedAt": now_iso(),
            }
        )

    def recover_liquidity(self, state: dict[str, Any]) -> int:
        metrics = self.refresh_metrics(state)
        open_jobs = sorted((job for job in state["recoveryQueue"] if job.get("status") == "open"), key=lambda job: (-float(job.get("priorityScore") or 0), job["createdAt"]))
        completed = 0
        for job in open_jobs:
            if float(metrics.get("activeLiquidity") or 0) >= self.config.low_liquidity_threshold and float(job.get("priorityScore") or 0) <= 0:
                continue
            proof_tx = f"simulated-recovery-{uuid.uuid4().hex}"
            job.update({"status": "completed", "leasedByCrankerPubkey": self.config.cranker_pubkey, "proofTx": proof_tx, "updatedAt": now_iso()})
            entry = self.registry_entry(state, job["transferId"])
            if entry:
                entry.update({"recoveryProofTx": proof_tx, "updatedAt": now_iso()})
            metrics["activeLiquidity"] = float(metrics.get("activeLiquidity") or 0) + float(job.get("recoverableAmount") or 0)
            metrics["vaultBalance"] = float(metrics.get("vaultBalance") or 0) + float(job.get("recoverableAmount") or 0)
            metrics["updatedAt"] = now_iso()
            completed += 1
        return completed

    def tick(self) -> tuple[int, int, int]:
        state = self.load()
        intent_count = self.verify_intents(state)
        settlement_count = self.settle_claims(state)
        recovery_count = self.recover_liquidity(state)
        self.refresh_metrics(state)
        self.save(state)
        return intent_count, settlement_count, recovery_count

    def run(self) -> None:
        while True:
            counts = self.tick()
            if any(counts):
                print(f"[tsn-python-cranker] intent={counts[0]} settlement={counts[1]} recovery={counts[2]}", flush=True)
            time.sleep(self.config.poll_seconds)


def load_config() -> SchedulerConfig:
    pubkey = os.environ.get("TSN_CRANKER_PUBKEY") or os.environ.get("TSN_CRANKER_OPERATOR_PUBKEY") or "local-python-cranker"
    dna = os.environ.get("TSN_CRANKER_DNA", "trustlink-authorized-cranker")
    return SchedulerConfig(
        mempool_file=Path(os.environ.get("TSN_MEMPOOL_FILE", ".tsn/mempool.json")).resolve(),
        cranker_pubkey=pubkey,
        dna_hash=sha256_hex(f"tsn-cranker-dna:{dna}"),
        poll_seconds=float(os.environ.get("TSN_CRANKER_POLL_SECONDS", "2")),
        low_liquidity_threshold=float(os.environ.get("TSN_LOW_LIQUIDITY_THRESHOLD", "100")),
    )


if __name__ == "__main__":
    scheduler = TsnScheduler(load_config())
    if os.environ.get("TSN_CRANKER_ONCE") == "true":
        print(scheduler.tick())
    else:
        scheduler.run()
