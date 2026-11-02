# TSN network and runtime

## Service path

Receiver accepts and stores authenticated ingress. TSN Node verifies the signed request, resolves TIP route data, and prepares authorized work. A Cranker leases and submits the exact authorized transaction. Solana confirmation is the chain execution result; it is distinct from Receiver acceptance, Node verification, Cranker submission, and reserve-funding confirmation.

## Current credit program path

The current TSNP credit instruction authorizes the exact hidden-head context and calls TCAP `credit_gpru_memo_v1`. TCAP validates asset, reserve, root, sequence and slot conditions, then invokes GPRU's twelve-input proof/Memo verifier before atomically advancing the shared root and liability counters. The Memo remains transaction instruction data. This call does not create a `TCapTinTipV1` account or persist a public latest ciphertext per TIN.

GPRU verifies the hidden route/head and transition relation; TCAP governs accepted assets, authorization, reserves and accounting. Node's root-selected witness store and pinned local prover adapter are implemented. Missing settings, stale snapshots or incompatible verifier state stop preparation. The ABI does not encode a plaintext TIN or private predecessor pointer, but public action fields, shared-root ordering, timing, wallets and authorized service knowledge remain relevant privacy limits.

The November 2 experiment verified local circuit/key/proof compatibility and four program builds. Its chain/environment preflight is dated before operator deployment and may be stale. Current verifier initialization, runtime configuration and confirmed settlement remain separate evidence requirements; see the [Laboratory architecture map](./laboratory/architecture-map.md) and [readiness experiment](./laboratory/experiments/EXP-20261102-hidden-head.md).

## State and recovery

TIP registry and owner-recovery records are separate on-chain accounts. TCAP's global root is protocol-wide replay state, not a user balance container. Transaction Memo history is retrieved from Solana transaction history through RPC or an indexing service; a confirmed transaction does not imply that an application has indexed the full TIN history.

TCAP source retains older per-TIN tip, debit, and exit instructions. Their presence is not evidence that current TSN XP flows invoke them. See [Current architecture](./CURRENT-ARCHITECTURE.md) and [GPRU hidden-head status](./gpru-tcap-route.md).
