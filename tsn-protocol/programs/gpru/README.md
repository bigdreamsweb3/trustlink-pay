# GPRU program

This directory is the home for the standalone GPRU on-chain program. Its intended responsibilities are encrypted balance-note state, proof verification, nullifier replay protection, and atomic handoff to TCAP. It must not resolve TIP/TIN identity or hold plaintext balances.

The design contract, credit/debit flow, privacy constraints, and implementation gates are documented in [GPRU Confidential Balance Architecture](../../tsn-docs/architecture/gpru-confidential-balances.mdx).

The Rust core is in `src/`. It decodes Solana 1.18.26 verifier-owned ciphertext-equality and range contexts, defines encrypted-state continuity fields, and implements the GPRU V1 one-time ElGamal DNA key derivation. The TIP route's committed ElGamal key is the scan key only; Node derives a fresh ephemeral key and one-time receiving public key for each DNA, while the owner derives the matching private key locally.

Build the native library used by the Python Node adapter from the repository root:

```sh
cargo build --release --manifest-path tsn-protocol/programs/gpru/Cargo.toml
```

The Python adapter in `services/tsn-node/gpru_crypto.py` loads that library and uses the OS CSPRNG for per-DNA randomness. The derivation primitive is not yet used by the TCAP settlement instruction. GPRU is still a library, not a deployable program; its program ID/account ownership contract, on-chain derivation proof, successor arithmetic, and TCAP CPI are not implemented. Debit paths stay fail-closed.

Keep the eventual program organized by responsibility:

```text
src/
  state.rs        encrypted balance state and continuity contract
  stealth_keys.rs one-time ElGamal DNA key derivation
  ffi.rs          native interface for the Python Node
  proofs/         verifier-owned proof context decoding
  instructions/   initialize, credit, transfer, and spend
```

A hash, signature, ciphertext shape check, or stored proof-context digest cannot establish that a successor balance follows from the current balance. The GPRU instruction must verify that arithmetic relation before updating state or authorizing TCAP reserve accounting.
