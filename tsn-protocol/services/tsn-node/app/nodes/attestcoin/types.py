from __future__ import annotations

from typing import Protocol
from enum import StrEnum
from dataclasses import dataclass
from .attestation_tracker_read import read as _AttestationTracker_read
from .attestation_tracker_write import write as _AttestationTracker_write
from .evm_cranker_submit_tin_exit_proof import submit_tin_exit_proof as _EvmCranker_submit_tin_exit_proof
from .http_evm_cranker_init import __init__ as _HttpEvmCranker_init
from .http_evm_cranker_submit_tin_exit_proof import submit_tin_exit_proof as _HttpEvmCranker_submit_tin_exit_proof
from .in_memory_attestation_tracker_init import __init__ as _InMemoryAttestationTracker_init
from .in_memory_attestation_tracker_read import read as _InMemoryAttestationTracker_read
from .in_memory_attestation_tracker_write import write as _InMemoryAttestationTracker_write
from .attestcoin_worker_init import __init__ as _AttestcoinWorker_init
from .attestcoin_worker_run import run as _AttestcoinWorker_run
from .attestcoin_worker_get_verified_proof import _get_verified_proof as _AttestcoinWorker_get_verified_proof
from .attestcoin_worker_submit_with_retries import _submit_with_retries as _AttestcoinWorker_submit_with_retries
from .attestcoin_worker_write import _write as _AttestcoinWorker_write
from .attestcoin_worker_idempotency_key import _idempotency_key as _AttestcoinWorker_idempotency_key
from .attestcoin_worker_validate import _validate as _AttestcoinWorker_validate

class AttestationState(StrEnum):
    PENDING = 'PENDING'
    ANCHOR_SUBMITTED = 'ANCHOR_SUBMITTED'
    ANCHOR_CONFIRMED = 'ANCHOR_CONFIRMED'
    PROOF_WAITING = 'PROOF_WAITING'
    PROOF_VERIFIED = 'PROOF_VERIFIED'
    ASC_SUBMITTED = 'ASC_SUBMITTED'
    ATTESTED = 'ATTESTED'

@dataclass(frozen=True)
class TinExitAttestationJob:
    settlement_id: str
    anchor_tx_hash: str
    sealed_tip_head_hash: str
    amount: str
    tin_hash: str
    exit_commitment: str
    merchant_override: bool = False

@dataclass(frozen=True)
class AttestationResult:
    settlement_id: str
    state: AttestationState
    anchor_tx_hash: str
    creditcoin_tx_hash: str | None = None

class AttestationTracker(Protocol):
    read = _AttestationTracker_read
    write = _AttestationTracker_write

class EvmCranker(Protocol):
    submit_tin_exit_proof = _EvmCranker_submit_tin_exit_proof

class HttpEvmCranker:
    """Adapter for the existing EVM cranker service.

    The cranker endpoint is configuration, not hardcoded protocol logic. It
    must submit TinExitAttestedASC.execute on Creditcoin and return the tx hash.
    """
    __init__ = _HttpEvmCranker_init
    submit_tin_exit_proof = _HttpEvmCranker_submit_tin_exit_proof

class InMemoryAttestationTracker:
    """Small tracker for unit tests; production Node wiring should use its store."""
    __init__ = _InMemoryAttestationTracker_init
    read = _InMemoryAttestationTracker_read
    write = _InMemoryAttestationTracker_write

class AttestcoinWorker:
    __init__ = _AttestcoinWorker_init
    run = _AttestcoinWorker_run
    _get_verified_proof = _AttestcoinWorker_get_verified_proof
    _submit_with_retries = _AttestcoinWorker_submit_with_retries
    _write = _AttestcoinWorker_write
    _idempotency_key = staticmethod(_AttestcoinWorker_idempotency_key)
    _validate = staticmethod(_AttestcoinWorker_validate)
