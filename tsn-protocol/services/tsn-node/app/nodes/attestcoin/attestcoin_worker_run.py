from __future__ import annotations

from .constants import logger

async def run(self, job: TinExitAttestationJob) -> AttestationResult:
    from .types import AttestationResult, AttestationState, TinExitAttestationJob
    self._validate(job)
    existing = await self.tracker.read(job.settlement_id)
    if existing and existing.get("state") in {
        AttestationState.ASC_SUBMITTED.value,
        AttestationState.ATTESTED.value,
    }:
        return AttestationResult(
            job.settlement_id,
            AttestationState(existing["state"]),
            job.anchor_tx_hash,
            existing.get("creditcoin_tx_hash"),
        )

    await self._write(job, AttestationState.PENDING, {"anchor_tx_hash": job.anchor_tx_hash})
    await self._write(job, AttestationState.ANCHOR_SUBMITTED, {})
    await self._write(job, AttestationState.ANCHOR_CONFIRMED, {})
    await self._write(job, AttestationState.PROOF_WAITING, {})
    proof = await self._get_verified_proof(job)
    await self._write(job, AttestationState.PROOF_VERIFIED, {"proof_ready": True})

    payload = {
        "idempotencyKey": self._idempotency_key(job),
        "settlementId": job.settlement_id,
        "sourceChainKey": 1,
        "anchorTxHash": job.anchor_tx_hash,
        "evidence": {
            "sealedTipHeadHash": job.sealed_tip_head_hash,
            "amount": job.amount,
            "tinHash": job.tin_hash,
            "exitCommitment": job.exit_commitment,
        },
        "proof": proof,
    }
    creditcoin_tx_hash = await self._submit_with_retries(payload)
    await self._write(
        job,
        AttestationState.ASC_SUBMITTED,
        {"creditcoin_tx_hash": creditcoin_tx_hash},
    )
    await self._write(
        job,
        AttestationState.ATTESTED,
        {"creditcoin_tx_hash": creditcoin_tx_hash},
    )
    logger.info("TinExitAttested settlement=%s tx=%s", job.settlement_id, creditcoin_tx_hash)
    return AttestationResult(job.settlement_id, AttestationState.ATTESTED, job.anchor_tx_hash, creditcoin_tx_hash)
