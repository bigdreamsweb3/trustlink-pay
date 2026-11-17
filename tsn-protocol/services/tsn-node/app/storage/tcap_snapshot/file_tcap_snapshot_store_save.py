from __future__ import annotations

import base64
import json
import os

async def save(self, envelope: EncryptedTcapSnapshotEnvelope) -> None:
    from .types import EncryptedTcapSnapshotEnvelope
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
