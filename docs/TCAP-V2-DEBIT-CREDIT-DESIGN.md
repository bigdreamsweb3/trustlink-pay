# TCAP balance transitions and GPRU proof boundary

This document distinguishes source that exists from the intended confidential-balance security contract. TCAP governs assets, reserves, and liabilities. GPRU verifies cryptographic relations. The checked-in hidden-head proof source is not yet a complete or wired balance-proof system.

## Current source behavior

The TSN credit instruction currently invokes GPRU's `apply_credit_transition_v1`, then TCAP's `credit_gpru_memo_v1`. GPRU validates an initial ciphertext against a proof of the funded amount, or validates later ElGamal ciphertext addition against the caller-provided predecessor ciphertext and sequence. TCAP validates the shared root, global root sequence, approved asset, policy, authorization signer, and validity window before advancing that root. The transaction binds the Memo instruction data to the GPRU credit transition.

The TCAP shared root prevents the same exact root transition from being applied twice. It is global shared state, not a per-TIN balance head. GPRU does not persist an authoritative per-TIN predecessor in this path, so this check alone does not prove that a caller supplied the latest state for that TIN. The Memo is transaction data available through Solana transaction history; the current source does not make TCAP store a balance ciphertext or the full Memo history in an account.

## Hidden-head source path

GPRU contains a Groth16 verifier entrypoint and Circom source for a hidden route/asset head update with sequence advancement and nullifier non-membership. TCAP contains `advance_gpru_hidden_head_v1`, which calls that verifier and updates its shared commitment root. This path is not called by the active TSN settlement instruction, Node, SDK, or Cranker.

The current circuit source does not prove encrypted-balance addition or subtraction, debit affordability, non-negative range, or reserve conservation. The TCAP instruction ABI also includes public `action_kind`, `token_id`, and `amount` fields. Do not claim those values are hidden. Circuit compilation, setup artifacts, proof generation, integration testing, and Devnet execution are not established by source presence.

## Required balance-proof contract

For a credit, a future integration must prove that the successor encrypted balance is the exact addition of the confirmed deposit to the authenticated predecessor. For a debit, it must prove that the prior balance covers the amount, the successor is the exact subtraction, and the result is in range. For an exit, TCAP must bind the proved debit to the public destination and enforce reserve solvency. A TIN-to-TIN transfer must prove source/destination conservation for the same asset.

TCAP must perform its reserve-liability and replay-state updates atomically with the verified proof result. Client-side decryption or arithmetic may improve user feedback but cannot substitute for on-chain validation. A Memo commitment only binds bytes; it is not itself a proof that the encrypted bytes represent a valid balance transition.

## Privacy boundary

The hidden-head design avoids a public per-TIN head account, but uses a single writable TCAP root account. That account appears in each transition using this path, and its sequence and root changes expose global ordering. The zero-linkability goal is therefore not achieved by the current shared-root design. Public funding, exits, timestamps, fee payer, and transaction instruction data remain visible according to their on-chain representation.

## Status

The source has a legacy TIN-tip family of TCAP account/instruction definitions, a wired TSN credit path using a shared root and Memo commitment, and a separate hidden-head verifier path that is not wired to runtime callers. Do not use historical per-tip smoke scripts as evidence that the hidden-head path or confidential debit/exit works. See [Current architecture](./CURRENT-ARCHITECTURE.md) and [GPRU hidden-head status](./gpru-tcap-route.md).
