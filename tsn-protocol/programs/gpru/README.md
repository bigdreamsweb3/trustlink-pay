# GPRU program

This directory is the home for the standalone GPRU on-chain program. Its intended responsibilities are encrypted balance-note state, proof verification, nullifier replay protection, and atomic handoff to TCAP. It must not resolve TIP/TIN identity or hold plaintext balances.

The design contract, credit/debit flow, privacy constraints, and implementation gates are documented in [GPRU Confidential Balance Architecture](../../tsn-docs/architecture/gpru-confidential-balances.mdx).

The Rust core is in `src/`. It decodes Solana 1.18.26 verifier-owned ciphertext-equality and range contexts, defines encrypted-state continuity fields, and implements the GPRU V1 one-time ElGamal DNA key derivation. The TIP route's committed ElGamal key is the scan key only; Node derives a fresh ephemeral key and one-time receiving public key for each DNA, while the owner derives the matching private key locally. The Node derivation also emits a public Chaum–Pedersen proof: it demonstrates that the ephemeral point and shared scan point were formed with the same Node-generated scalar, without revealing that scalar. The on-chain GPRU entrypoint verifies this proof and recomputes the one-time public key from the scan key and DNA.

Build the native library used by the Python Node adapter from the repository root:

```sh
cargo build --release --manifest-path tsn-protocol/programs/gpru/Cargo.toml
```

The Python adapter in `services/tsn-node/gpru_crypto.py` loads the native library and uses the OS CSPRNG for independent per-DNA derivation and proof nonces. The deployable entrypoint currently verifies only the key-derivation proof; it has no state accounts and does not persist DNA, verify balance arithmetic, or invoke TCAP. The live TCAP settlement instruction does not call it, and debit paths stay fail-closed.

The program ID is `6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR`. Its local deployment keypair is stored at `gpru-program-keys/gpru-program-keypair.json` and is ignored by Git. The Anchor workspace and program ID are configured in `Anchor.toml`; build and deploy through the root scripts:

```sh
npm run gpru:program:build:devnet
npm run gpru:program:deploy:devnet
```

The scripts use GPRU's Anchor Devnet RPC and configured deploy wallet. They do not include GPRU in the aggregate TSN/TCAP deployment command.

Keep the eventual program organized by responsibility:

```text
src/
  state.rs        encrypted balance state and continuity contract
  stealth_keys.rs one-time ElGamal DNA key derivation
  ffi.rs          native interface for the Python Node
  program.rs      deployable DNA-key proof verifier entrypoint
  proofs/         verifier-owned proof context decoding
```

A hash, signature, ciphertext shape check, or stored proof-context digest cannot establish that a successor balance follows from the current balance. The GPRU instruction must verify that arithmetic relation before updating state or authorizing TCAP reserve accounting.
