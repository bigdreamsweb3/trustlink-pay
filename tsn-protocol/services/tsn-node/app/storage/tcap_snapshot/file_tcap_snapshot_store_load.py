from __future__ import annotations

import base64
import json

async def load(self, commitment: str) -> EncryptedTcapSnapshotEnvelope | None:
    from .types import EncryptedTcapSnapshotEnvelope
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
