"""Opaque encrypted TCap snapshot persistence for the Node/Mother boundary.

This module accepts only an already-encrypted envelope. It never accepts a
plaintext balance record and never logs ciphertext, TINs, roots, or balances.
The filesystem implementation is a local durable adapter; production can
implement the same protocol with Firebase/KMS-backed storage."""

from app.storage.tcap_snapshot import (
    _key,
    EncryptedTcapSnapshotEnvelope,
    FileTcapSnapshotStore,
    TcapSnapshotStore,
    _COMMITMENT_RE,
)

__all__ = ['_key', 'EncryptedTcapSnapshotEnvelope', 'FileTcapSnapshotStore', 'TcapSnapshotStore', '_COMMITMENT_RE']
