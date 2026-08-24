"""Opaque encrypted TCap snapshot persistence for the Node/Mother boundary.

This module accepts only an already-encrypted envelope. It never accepts a
plaintext balance record and never logs ciphertext, TINs, roots, or balances.
The filesystem implementation is a local durable adapter; production can
implement the same protocol with Firebase/KMS-backed storage.
"""

from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


_COMMITMENT_RE = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class EncryptedTcapSnapshotEnvelope:
    version: int
    sequence: int
    previous_commitment: str
    new_commitment: str
    policy_commitment: str
    transition_nullifier: str
    tsn_settlement_commitment: str
    created_at: int
    encrypted_record_locator: str
    nonce: bytes
    ciphertext: bytes

    def __post_init__(self) -> None:
        if self.version != 1:
            raise ValueError("unsupported_snapshot_version")
        if self.sequence < 0 or self.created_at < 0:
            raise ValueError("snapshot_number_invalid")
        for label, value in (
            ("previous_commitment", self.previous_commitment),
            ("new_commitment", self.new_commitment),
            ("policy_commitment", self.policy_commitment),
            ("transition_nullifier", self.transition_nullifier),
            ("tsn_settlement_commitment", self.tsn_settlement_commitment),
        ):
            if not _COMMITMENT_RE.fullmatch(value.lower()):
                raise ValueError(f"{label}_invalid")
        if not self.encrypted_record_locator or len(self.nonce) != 12 or not self.ciphertext:
            raise ValueError("invalid_encrypted_snapshot_envelope")


class TcapSnapshotStore(Protocol):
    async def save(self, envelope: EncryptedTcapSnapshotEnvelope) -> None: ...

    async def load(self, commitment: str) -> EncryptedTcapSnapshotEnvelope | None: ...


def _key(commitment: str) -> str:
    normalized = commitment.lower()
    if not _COMMITMENT_RE.fullmatch(normalized):
        raise ValueError("commitment_invalid")
    return normalized


class FileTcapSnapshotStore:
    """Atomic local adapter keyed only by the opaque new commitment."""

    def __init__(self, root: str | os.PathLike[str]) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, commitment: str) -> Path:
        return self.root / f"{_key(commitment)}.json"

    async def save(self, envelope: EncryptedTcapSnapshotEnvelope) -> None:
        path = self._path(envelope.new_commitment)
        payload = {
            "version": envelope.version,
            "sequence": envelope.sequence,
            "previous_commitment": envelope.previous_commitment,
            "new_commitment": envelope.new_commitment,
            "policy_commitment": envelope.policy_commitment,
            "transition_nullifier": envelope.transition_nullifier,
            "tsn_settlement_commitment": envelope.tsn_settlement_commitment,
            "created_at": envelope.created_at,
            "encrypted_record_locator": envelope.encrypted_record_locator,
            "nonce": base64.b64encode(envelope.nonce).decode("ascii"),
            "ciphertext": base64.b64encode(envelope.ciphertext).decode("ascii"),
        }
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, sort_keys=True, separators=(",", ":")), encoding="utf-8")
        os.replace(temporary, path)

    async def load(self, commitment: str) -> EncryptedTcapSnapshotEnvelope | None:
        path = self._path(commitment)
        if not path.exists():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        return EncryptedTcapSnapshotEnvelope(
            version=int(payload["version"]),
            sequence=int(payload["sequence"]),
            previous_commitment=str(payload["previous_commitment"]),
            new_commitment=str(payload["new_commitment"]),
            policy_commitment=str(payload["policy_commitment"]),
            transition_nullifier=str(payload["transition_nullifier"]),
            tsn_settlement_commitment=str(payload["tsn_settlement_commitment"]),
            created_at=int(payload["created_at"]),
            encrypted_record_locator=str(payload["encrypted_record_locator"]),
            nonce=base64.b64decode(payload["nonce"], validate=True),
            ciphertext=base64.b64decode(payload["ciphertext"], validate=True),
        )
