# TSN network and runtime

## Service path

Receiver accepts and stores authenticated ingress. TSN Node verifies the signed request, resolves TIP route data, and prepares authorized work. A Cranker leases and submits the exact authorized transaction. Solana confirmation is the chain execution result; it is distinct from Receiver acceptance, Node verification, Cranker submission, and reserve-funding confirmation.

## Current credit program path

The current TSN credit instruction invokes GPRU key-proof verification and GPRU credit-transition validation, then calls TCAP `credit_gpru_memo_v1`. TCAP advances one global commitment root after checking its predecessor and next sequence. The Memo remains transaction instruction data. The path does not create a `TCapTinTipV1` account or persist a latest ciphertext per TIN.

GPRU/TCAP source separately includes a hidden-head Groth16 verifier and shared-root transition instruction. The active Node, SDK, and Cranker do not call this path. The circuit/prover/deployment lifecycle is not validated end to end, and the current ABI exposes action kind, token ID, and amount. All such transitions use the shared TCAP root account, which exposes common ordering and linkage.

## State and recovery

TIP registry and owner-recovery records are separate on-chain accounts. TCAP's global root is protocol-wide replay state, not a user balance container. Transaction Memo history is retrieved from Solana transaction history through RPC or an indexing service; a confirmed transaction does not imply that an application has indexed the full TIN history.

TCAP source retains older per-TIN tip, debit, and exit instructions. Their presence is not evidence that current TSN XP flows invoke them. See [Current architecture](./CURRENT-ARCHITECTURE.md) and [GPRU hidden-head status](./gpru-tcap-route.md).
