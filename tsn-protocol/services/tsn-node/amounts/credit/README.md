# Private credit amount openings

This package owns the existing token/amount/blinding/nullifier commitment and restricted credit opening journal. `commitment` accepts a positive registered u32 token, positive u64 amount and canonical nonzero BN254 blinding/nullifier. `publish_opening` publishes an immutable opening only when it matches the witness commitment; `read_opening` validates its schema and recomputes that commitment before returning it.

The journal contains sensitive amount openings and belongs inside the configured witness directory. Atomic hard-link publication, existing JSON encoding, domain and error strings are preserved. This package depends on the native Poseidon adapter in `security.cryptography`; it has no HTTP, service lifecycle or chain authority.

Import the named functions from `amounts.credit.commitment`, `amounts.credit.publish_opening` and `amounts.credit.read_opening`. `credit_amount.py` provides the existing public imports from these same implementations. Engineers should replace a dependency at its implementation module or inject it into the caller, rather than patching an export interface.
