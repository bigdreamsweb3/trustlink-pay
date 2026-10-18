# GPRU program

This directory is the home for the standalone GPRU on-chain program. Its intended responsibilities are encrypted balance-note state, proof verification, nullifier replay protection, and atomic handoff to TCAP. It must not resolve TIP/TIN identity or hold plaintext balances.

The design contract, credit/debit flow, privacy constraints, and implementation gates are documented in [GPRU Confidential Balance Architecture](../../tsn-docs/architecture/gpru-confidential-balances.mdx).

The initial shared Rust core is in `src/`. It decodes Solana 1.18.26 verifier-owned ciphertext-equality and range contexts and defines encrypted-state continuity fields. It is not a deployable program and is not yet wired into TCAP. The GPRU program ID and account ownership contract remain unassigned, and successor arithmetic is not implemented. Debit paths stay fail-closed until those checks are complete.

Keep the eventual program organized by responsibility:

```text
src/
  state.rs        encrypted balance state and continuity contract
  proofs/         verifier-owned proof context decoding
  instructions/   initialize, credit, transfer, and spend
```

A hash, signature, ciphertext shape check, or stored proof-context digest cannot establish that a successor balance follows from the current balance. The GPRU instruction must verify that arithmetic relation before updating state or authorizing TCAP reserve accounting.
