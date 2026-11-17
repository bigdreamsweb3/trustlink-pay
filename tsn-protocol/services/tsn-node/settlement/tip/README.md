# TIP route snapshot synchronization

This package reconstructs the existing append-only TIP route tree from confirmed, indexed creation history. It validates registry/account ownership, route and point commitments, invocation-bound append logs, transaction layout, complete indices and exact selected root/count equality. Cached prefixes remain usable only when reconstruction reaches the chain-selected root. Snapshot publication preserves its existing immutable hard-link behavior and conflict checks.

`registry_take` implements the bounded decoder cursor previously nested in `decode_registry`; `decode_registries` supplies the same ordered batch decoding to `asyncio.to_thread`. Each helper has one implementation file. `snapshot_size` is shared with funding snapshot prefix selection and preserves the original maximum-prefix ordering.

Public functions retain their signatures in the named `settlement.tip` implementation modules and the `tip_snapshot_sync.py` export interface. `ensure_tip_snapshot` accepts an async RPC dependency and its existing publication/program arguments. Dependencies are public-key decoding, native Poseidon and witness validation. The package stores commitments, skips encrypted envelopes and performs no owner-data decryption, work authorization or transaction submission.
