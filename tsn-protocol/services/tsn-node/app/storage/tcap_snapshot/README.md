# Encrypted TCAP snapshots

`EncryptedTcapSnapshotEnvelope` validates the existing version, nonnegative scalar fields, commitment spellings, locator, nonce length and ciphertext presence. `FileTcapSnapshotStore` writes only the caller's already encrypted envelope under its opaque new commitment, using a temporary file and `os.replace`. Loading reconstructs and validates the same envelope. The store never accepts a plaintext balance record.

`app.services.tcap_snapshot_store` remains the public interface, including `TcapSnapshotStore`. This retained adapter is distinct from current root-selected hidden-head witness persistence. `tests/test_tcap_snapshot_and_credit_handoff.py` covers local save/load and invalid-envelope rejection with temporary directories. Construction intentionally creates the supplied local root; no remote KMS/Firebase adapter is invented here.
