# GPRU hidden-head proof: implementation status

GPRU is a separate Solana program. Its source includes one-time ElGamal key derivation and a Groth16 verifier for a hidden per-TIN latest-head transition. TCAP remains the protocol that governs reserves and owns the shared commitment root. This page records which pieces exist in source and which are not wired into settlement.

## TIP data used by the design

TIP's TIN V1 registry contains a versioned GPRU ElGamal scan public key and a commitment to that key, plus route and policy commitments. The key is public route material; the matching secret is retained by the owner. The current hidden-head circuit does not take a per-TIN registry account as an instruction account. Instead, it uses a public TIP shared route Merkle root and a private witness proving membership of a route leaf. The TIP Registrar source has an append-only shared route-root implementation.

## Hidden-head transition contract in source

The circuit's private witness includes route membership, the hidden route-and-asset map key, the predecessor head and sequence, sparse-map paths, and a one-time nullifier's prior empty path. Its six public inputs are:

1. TCAP shared root before the action.
2. TCAP shared root after the action.
3. Commitment to the Memo instruction immediately following the TSN instruction.
4. Action commitment.
5. One-time nullifier.
6. TIP shared route-membership root.

GPRU checks the canonical TIP root, TCAP root, verifier configuration, TSN top-level caller, and following Memo instruction before verifying the Groth16 proof. TCAP's `advance_gpru_hidden_head_v1` checks its current root, the global sequence increment, active asset/policy state, Mother-derived signer, TSN caller, and validity slots, then invokes GPRU and advances the shared TCAP root atomically.

The single TCAP root is global to this protocol state, not one account per TIN. Every user action through this path writes that same account. The proof is intended to hide which route/head changed; the shared account address, root updates, and transaction ordering remain visible and create protocol-level correlation.

## What this proof does not establish

The circuit source binds a Memo commitment and an action commitment to a hidden head update. It does not implement homomorphic balance arithmetic, prove that a debit is affordable, prove a non-negative balance, or prove reserve-liability conservation. In the current instruction ABI, action kind, token ID, and amount are explicit public arguments. They are not hidden by the Groth16 proof.

The circuit and verifier source are not a complete production proof system. This repository snapshot does not establish a compiled circuit, generated proving/verifying key pair, trusted setup artifacts, proof-generation service, initialized on-chain verifier configuration, or end-to-end transaction test. GPRU's hidden-head instruction and TCAP's root-advance instruction are not called by the current TSN Node/SDK/Cranker settlement flow.

## Current credit path

The active TSN source path calls GPRU's `apply_credit_transition_v1` for first-credit validation or ElGamal addition against a supplied predecessor ciphertext, then calls TCAP's `credit_gpru_memo_v1` to advance the shared TCAP root. This does not persist a per-TIN latest head and does not establish that a supplied predecessor ciphertext is the latest one. The Memo carries transaction data; it is not a persistent account.

TCAP still contains `TCapTinTipV1` and older instructions that use it. That legacy account is not created by the active TSN credit instruction. The current TSN credit path has no per-TIN TCAP tip PDA.

## Next verification gates

Before treating hidden-head transitions as live, the protocol needs circuit compilation and constraint review; reproducible key generation/setup and artifact commitments; prover and verifier interoperability tests; TIP root append and proof witness tests; TCAP/GPRU/TSN ABI wiring; amount-privacy decisions; solvency and balance-transition proofs; end-to-end SDK/Node/Cranker tests; and Devnet deployment plus confirmed transaction evidence. Source presence alone does not pass these gates.

For the complete source-backed status, see [Current architecture](./CURRENT-ARCHITECTURE.md). The old per-TIP TCAP smoke procedures are historical and are not instructions for the hidden-head path.
