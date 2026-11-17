# Funded notes and authenticated funding snapshots

This package owns private funding-note validation, secret-derived nullifiers, registered token/amount-bound funded leaves and reconstruction of public funded-note membership. Note domains, commitment encodings and field/error validation are unchanged. `funding_contract.py` preserves the TCAP program, global PDA seed, 6,209-byte account layout, 128-entry retained history and local history bounds.

`read_funding_root`, `decode_funding_root` and `select_funding_root` authenticate current or retained positive-count root/count pairs against the canonical global account. `ensure_funding_snapshot` reconstructs append events through its caller-supplied async RPC function, verifies ordered root/count equality and rechecks the selected root before immutable publication. `funding_membership` returns the existing root/index/path witness. Private note openings are not saved in these public snapshots.

Import each function from its correspondingly named implementation module. `funding_note.py` and `funding_snapshot_sync.py` preserve the original public exports, including private decoder helpers. Dependencies are `app.solana_pubkey`, witness/tree helpers and native Poseidon. RPC transport, credentials, leases and transaction submission belong to the caller; the package does not import server state or add a funding-pool path.
