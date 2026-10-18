# GPRU DNA routing with TIP and TCAP

## Purpose

GPRU (Guarded Privacy Routing Unit) is a protocol layer for creating and verifying transaction-specific, unlinkable recipient state. TIP identifies the transfer identity and provides the owner's route key material. TCAP governs the asset reserve and applies only a validated GPRU transition. A TIN is one identity within TIP, not a synonym for TIP.

## Current TIP route data

The current TIP V1 registry includes a versioned GPRU ElGamal scan public key and a commitment to that key, plus TIP route and policy commitments. The scan key is stable for the route and is public. Its commitment detects key/version substitution; it is not a secret, proof, encryption key, DNA, or balance.

## GPRU transaction DNA target

For each credit or debit, Node will create a fresh DNA identifier and use fresh randomness with the route's scan public key to derive a one-time ElGamal public key. It will bind the DNA, derivation version, ephemeral public point, and one-time public key into a domain-separated commitment. The transaction uses this unique DNA rather than publishing a stable TIP route address as its per-transfer destination.

The owner SDK uses owner-held secret material plus the public DNA and ephemeral point to derive the matching private key locally. Node and Cranker do not receive that private key or decrypt the owner's balance. The Rust GPRU derivation core, Node native adapter, and SDK recovery helper exist in source. They are not connected to a deployable GPRU program or the TCAP settlement ABI.

## Credit flow

1. Sender signs payment details and authorizes reserve funding. The sender SDK does not resolve the recipient's TIP state or construct recipient GPRU state.
2. Receiver accepts and stores the signed ingress work according to its ingress contract.
3. Node resolves the TIN through TIP, validates the route, asset, and signed authorization, then derives the unique DNA and one-time public key.
4. Node creates a complete GPRU transition and releases it as immutable settlement work only after protocol checks pass.
5. Cranker submits the exact authorized transaction and cannot rewrite its DNA, amount binding, proof, or destination.
6. GPRU verifies key-derivation evidence, encrypted-state proof, sequence/replay protection, and asset bindings. It hands the validated result to TCAP atomically.
7. TCAP updates the governed confidential liability only when GPRU verification and its reserve invariants succeed.
8. The recipient SDK discovers its DNA output and derives the matching private key locally to recover its own state.

## Debit and TIN-to-TIN transfer

For a debit, the owner proves that the prior encrypted balance covers the requested amount and that the successor is the correct subtraction. For a TIN-to-TIN transfer, the proof must also establish source/destination amount conservation while keeping each DNA unique and hiding the amount. TCAP must not accept an SDK-only balance check. Its state change must be conditional on GPRU's on-chain proof verification and replay protection in the same atomic transaction.

Wallet deposits and wallet exits remain public at their wallet boundary. The privacy objective is to avoid publishing a stable recipient TIP address on every confidential transfer; it does not conceal public funding or exit transaction metadata.

## Status and security boundary

Key derivation alone is not a complete privacy protocol or proof of balance correctness. The deployable GPRU program, DNA state and instruction contract, on-chain derivation and balance-proof verification, replay protection, and atomic TCAP handoff are not part of the current chain path. No plaintext private key or balance may be sent to Receiver, Node, or Cranker. No hash or key commitment alone proves a valid balance transition.
