# GPRU hidden-head Groth16 circuit V1

`main.circom` proves an update to one hidden per-TIN portfolio head. The outer authenticated map has one leaf per hidden TIP route. Each leaf commits to the route key commitment, sequence, previous Memo and action commitments, and a root for that TIN's token-balance commitment map. The nested map has one BabyJubjub Pedersen balance commitment per TCAP token ID. No per-TIN or per-transaction balance PDA is introduced.

## Public inputs

The twelve public inputs are ordered exactly as the GPRU, TSN, TCAP, and SDK proof ABIs:

1. `oldGlobalRoot`
2. `newGlobalRoot`
3. `memoCommitment` (SHA-256 of the complete Memo, reduced to the BN254 scalar field)
4. `actionCommitment`
5. `nullifier`
6. `tipRouteRoot`
7. `successorPortfolioRoot`
8. `successorBalanceX` for the selected token
9. `successorBalanceY` for the selected token
10. `encryptedBlindingDelta`, the one-time encrypted scalar `delta + x(e*S) mod q`
11. `deltaEphemeralPublicX`, the x coordinate of `E = e*Base8`
12. `deltaEphemeralPublicY`, the y coordinate of `E = e*Base8`

The Memo starts with `TSN_GPRU_HEAD_V1:<portfolio-root>:<balance-x>:<balance-y>:<action-commitment>:<encrypted-delta>:<ephemeral-x>:<ephemeral-y>:` followed by the Base64URL DBrix Ledger stream. GPRU parses all seven values, checks them against the public inputs, and hashes the complete instruction data for `memoCommitment`; the SHA-256 digest is reduced modulo the BN254 scalar modulus as the public field input. The owner-encrypted Ledger record deliberately omits the blinding delta. The owner reconstructs it from the one-time prefix ciphertext after decrypting the record.

## What the proof establishes

The witness proves that the hidden active TIP route is a member of the shared TIP route root, the supplied route leaf is the current leaf in the old shared TCAP root, its sequence advances once, and a fresh nullifier is inserted. It also proves a token-map update under the predecessor portfolio root and binds the selected token's successor Pedersen point to the action:

- Credit adds `amount * G` and a fresh, nonzero blinding delta to the predecessor point. The prover needs the predecessor point but not the balance or its prior blinding opening; the owner applies the encrypted delta to its locally held opening.
- Debit and exit open predecessor and successor balances privately, constrain both to unsigned 64-bit values, and prove the successor is nonnegative and differs by the authorized amount.
- Other token commitments remain in the same nested map; a first credit for a token uses an empty token leaf.

The circuit uses additive homomorphic **Pedersen commitments**, not encrypted balance ciphertexts. It also proves a separate one-time BabyJubjub encryption relation for the fresh Pedersen blinding delta: `C = delta + x(e*S) mod q`, where `S` is the private TIP-authenticated scan point, `e` is the private ephemeral scalar, and the Memo publishes only `C` and `E=e*Base8`. The owner derives `S`'s secret from the recovered master seed and decrypts `delta = C - x(s*E) mod q`. This binds the owner's recovered balance-history update to the exact delta in the Pedersen successor without publishing the delta or reusing a transaction-linkable ElGamal key. Credit updates the locally held opening by adding the recovered delta; debit and exit proofs open predecessor and successor points privately, prove the amount subtraction and nonnegative successor, and bind the same ciphertext relation. The commitment point in the Memo prefix is a proof binding, not an encryption.

The circuit does not prove token custody, reserve solvency, or TCAP liquidity. TCAP must enforce accepted assets, authorization, reserve conditions, and the shared-root update atomically. The circuit source and ABI alone do not enable a settlement path.

## Witness fields

The witness includes TIP membership data, the hidden route and current outer-head leaf, the outer-map path, the predecessor portfolio root, the selected token's prior point and 32-level token-map path, the hidden nullifier path, and action openings. The first route head must use the canonical empty portfolio root; a previously unseen token must use an empty token leaf. These checks prevent a prover from choosing arbitrary predecessor state.

## Build and setup

Compile using the pinned Circom and `circomlib` versions in `package.json`:

```sh
npm run gpru:circuit:compile
npm run gpru:prover:setup:dev
```

The development setup is not a production ceremony. This circuit change requires recompilation and a new circuit-specific proving/verifying key pair, followed by verifier-argument export, matching GPRU verifier configuration, and review of the exact public-input order. Existing 2026-10-31 setup artifacts are stale for this circuit change; generate the new setup into a new `GPRU_DEV_SETUP_DIR` so the old setup is preserved. New setup metadata binds the circuit source, R1CS, witness-calculator WASM, proving key, and verification key. Node's settlement adapter checks every artifact hash against an explicitly pinned manifest and compares the exact verification-key points and circuit commitment with GPRU's canonical on-chain verifier account.

## Node settlement adapter

Node uses `hidden_head_witness.py` to reconstruct candidate paths from local snapshots selected by the confirmed TCAP and TIP roots. The snapshots are untrusted inputs: Node recomputes their roots, binds the route leaf to the signed recipient TIN's current TIP registration, and rejects missing, altered, or stale state. TCAP alone advances the authoritative shared root. Node's stored successor snapshot is usable only after a chain read selects that exact root.

Configure `GPRU_HIDDEN_HEAD_WITNESS_DIR` and the explicit artifact paths in the Node `.env.example`, including `GPRU_PROVER_METADATA_SHA256`, the SHA-256 of the reviewed metadata file. The adapter has no automatic setup, artifact fallback, or external prover. `scripts/node-prove.mjs` receives a private witness over stdin, calculates the witness in memory, verifies the generated proof locally, and emits only public inputs, proof points, and verifier bindings. Node rechecks current roots after proving and reverifies the stored proof before authorizing the exact leased Cranker transaction.

The witness directory contains two snapshot formats. `tip-<confirmed-tip-root-hex>.json` contains `{ "version": 1, "leaves": ["decimal-poseidon-route-leaf", "..."] }` in TIP append order. `tcap-<confirmed-tcap-root-hex>.json` contains `{ "version": 1, "heads": {}, "nullifiers": [] }` for an empty map. An existing `heads` entry is keyed by the canonical field-reduced route-key hex and contains `sequence`, `memoCommitment`, `actionCommitment`, and `portfolio`; each portfolio entry is keyed by the decimal token ID and contains decimal `x` and `y` coordinates. The stored Memo commitment is the reduced proof field, not the unreduced SHA-256 digest. Nullifiers are canonical field hex. Snapshot indexing uses the low 128 bits of the canonical route key or Poseidon nullifier key, matching the circuit; collisions fail closed.

Snapshots must be supplied from retained authenticated-map state and TIP's append history. The adapter cannot reconstruct private paths from the shared root alone and does not assume an arbitrary root is an empty map. It stores successor commitments and points without owner balances or blinding openings. Snapshot availability and synchronization remain an operational requirement, including sharing candidates across Node replicas and supplying new TIP snapshots after registrations. Matching reviewed proving artifacts and on-chain verifier configuration remain required before settlement can run.

Cranker submits the authorization instruction and complete encrypted Memo atomically through `@dbrix/solana` `sendInstructionsV1`. This transport uses Solana transaction version 1 and its 4,096-byte complete-transaction limit. The canonical two-signer transaction occupies 1,505 bytes plus the ASCII Memo payload, including all account addresses, instruction framing, config values, and trailing signatures. Node checks this complete size before proving or authorizing the settlement and checks the actual received message size before Mother signing. The signature verifier requires the same seven-field proof-bound Memo prefix emitted by the Node and Cranker builders. These offline transport checks do not establish deployed verifier readiness or confirmed settlement.
