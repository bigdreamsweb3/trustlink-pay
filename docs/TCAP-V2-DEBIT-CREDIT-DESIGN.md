# TCAP balance transitions and GPRU proof boundary

This document distinguishes the proof-shaped TSN/TCAP ABI from a working proof-generation system. TCAP governs assets, reserves, and liabilities. GPRU verifies cryptographic relations. Node currently fails closed because the Groth16 prover and witness provider are not configured.

## Current source behavior

The TSN `register_tcap_credit_authorization_v2` instruction passes the hidden-head Groth16 proof to TCAP's `credit_gpru_memo_v1`. TCAP validates the shared-root predecessor and sequence, approved asset, authorization signer, validity window, pending liabilities, and reserve solvency, then invokes GPRU's `verify_hidden_head_transition_v1`. On proof success, TCAP advances the shared root and reserve liabilities atomically. The Memo is transaction instruction data bound by the proof.

The proof is intended to show that the private per-TIN/asset predecessor is the current head and to insert a nullifier as TCAP advances the global root. This does not create a per-TIN TCAP balance account. Memo history remains transaction data available through Solana transaction history.

## Hidden-head source path

GPRU contains the verifier entrypoint and Circom source for route membership, hidden-head update, Memo/action binding, nullifier insertion, and Pedersen balance constraints. The active TSN credit ABI carries the proof through TCAP to GPRU. The circuit has eight public inputs, including successor balance point X/Y. The circuit has not been compiled or reviewed; no proving/verifying keys, validated key converter, witness provider, prover service, initialized verifier, or Devnet proof evidence is established. Action kind, token ID, and amount are public instruction values.

## Required balance-proof contract

For a credit, a future integration must prove that the successor encrypted balance is the exact addition of the confirmed deposit to the authenticated predecessor. For a debit, it must prove that the prior balance covers the amount, the successor is the exact subtraction, and the result is in range. For an exit, TCAP must bind the proved debit to the public destination and enforce reserve solvency. A TIN-to-TIN transfer must prove source/destination conservation for the same asset.

TCAP must perform its reserve-liability and replay-state updates atomically with the verified proof result. Client-side decryption or arithmetic may improve user feedback but cannot substitute for on-chain validation. A Memo commitment only binds bytes; it is not itself a proof that the encrypted bytes represent a valid balance transition.

## Privacy boundary

The hidden-head design avoids a public per-TIN head account, but uses a single writable TCAP root account. That account appears in each transition using this path, and its sequence and root changes expose global ordering. The zero-linkability goal is therefore not achieved by the current shared-root design. Public funding, exits, timestamps, fee payer, and transaction instruction data remain visible according to their on-chain representation.

## Status

The source has legacy TIN-tip account/instruction definitions and a proof-shaped TSN credit path using one shared root and Memo instruction data. Node disables settlement until the prover and witness source are configured. Do not use historical per-tip smoke scripts as evidence that the hidden-head path or confidential debit/exit works. See [Current architecture](./CURRENT-ARCHITECTURE.md), [GPRU hidden-head status](./gpru-tcap-route.md), and [Groth16 prover and key artifacts](./GROTH16-PROVER-AND-KEY-ARTIFACTS.md).
