from __future__ import annotations

from typing import Protocol
from dataclasses import dataclass
from .encrypted_tcap_snapshot_envelope_post_init import __post_init__ as _EncryptedTcapSnapshotEnvelope_post_init
from .tcap_snapshot_store_save import save as _TcapSnapshotStore_save
from .tcap_snapshot_store_load import load as _TcapSnapshotStore_load
from .file_tcap_snapshot_store_init import __init__ as _FileTcapSnapshotStore_init
from .file_tcap_snapshot_store_path import _path as _FileTcapSnapshotStore_path
from .file_tcap_snapshot_store_save import save as _FileTcapSnapshotStore_save
from .file_tcap_snapshot_store_load import load as _FileTcapSnapshotStore_load

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
    __post_init__ = _EncryptedTcapSnapshotEnvelope_post_init

class TcapSnapshotStore(Protocol):
    save = _TcapSnapshotStore_save
    load = _TcapSnapshotStore_load

class FileTcapSnapshotStore:
    """Atomic local adapter keyed only by the opaque new commitment."""
    __init__ = _FileTcapSnapshotStore_init
    _path = _FileTcapSnapshotStore_path
    save = _FileTcapSnapshotStore_save
    load = _FileTcapSnapshotStore_load
