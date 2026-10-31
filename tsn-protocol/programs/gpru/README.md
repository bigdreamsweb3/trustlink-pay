# GPRU program

GPRU (Guarded Privacy Routing Unit) derives transaction-specific routing material and verifies hidden balance-head proofs. It does not hold tokens or regulate reserve liabilities. TIP manages TIN identity and route discovery; TCAP governs accepted assets, reserve liquidity, authorization, and atomic settlement state.

## Balance proof and Memo format

The hidden-head circuit commits to a single per-TIN portfolio root. That root is a nested map of TCAP token IDs to BabyJubjub Pedersen balance commitments. The Groth16 proof validates a selected token's credit, debit, or exit transition, advances the hidden TIN head, and inserts a fresh nullifier under the shared protocol root.

The balance points are homomorphic commitments, not ciphertexts and not decryptable values. The Solana Memo carries the successor portfolio root, selected-token point, and action commitment in its fixed prefix, followed by a DBrix Ledger stream. The Ledger stream contains a DBrix Secretbox-encrypted action record for owner recovery. The SDK decrypts actions and replays them to reconstruct per-token numeric balances and the opening deltas.

This removes the previous Ristretto-ElGamal portfolio vector from the Memo contract. Ristretto remains part of GPRU's transaction-specific route-key and record-key derivation; it is not used as the balance-state proof representation. The Groth16 circuit and Memo now describe the same BabyJubjub Pedersen commitment transition.

## Settlement status and security boundary

GPRU's on-chain verifier checks the proof's nine public inputs, the current shared TCAP root, TIP route root, proof-bound Memo prefix, and complete Memo commitment. TCAP remains responsible for accepted-token checks, confirmed funding or owner authorization, reserve/liquidity checks, and atomic root advancement.

The Node's settlement builder remains fail-closed. A trusted source for the current hidden TIN head, predecessor portfolio root, and token-map witness is still required before it can create a valid proof. An owner-recovered Memo action must match the on-chain action kind, token, amount, action commitment, authorization commitment, and nullifier before it is included in reconstructed history. The owner balance-history SDK also checks its private predecessor sequence; it does not substitute for that witness source or establish RPC scan completeness. No credit, debit, or exit should be described as enabled solely because the circuit, verifier, Memo builder, or SDK helper exists.

The encrypted action is owner-readable; the on-chain proof does not prove the Secretbox plaintext matches its public action inputs. The owner SDK compares the decrypted action fields with the action and authorization values in the confirmed on-chain proof statement before accepting history. The Groth16 circuit proves Pedersen arithmetic and hidden-head freshness, not confidentiality of all transaction metadata.

## Native Node adapter

The Node native library retains the Ristretto operations needed for one-time DNA keys and owner-encrypted Memo record key agreement. The former Ristretto encrypted-balance updater was removed because its ciphertext arithmetic had no relation to the BabyJubjub circuit proof.

Build the native library used by the Python adapter from the repository root:

```sh
cargo build --release --manifest-path tsn-protocol/programs/gpru/Cargo.toml
```

## Program identity and deployment

The program ID is `6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR`. Its local deployment keypair is stored at `gpru-program-keys/gpru-program-keypair.json` and is ignored by Git. Build and deploy only through the repository's configured scripts:

```sh
npm run gpru:program:build:devnet
npm run gpru:program:deploy:devnet
```

This circuit change alters the proof ABI and verifying-key shape. Recompile the circuit and regenerate matching setup artifacts before initializing or using the on-chain verifier. A source build is not evidence of deployment or live settlement support.
