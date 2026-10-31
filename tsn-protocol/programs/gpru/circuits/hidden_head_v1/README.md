# GPRU hidden-head Groth16 circuit V1

`main.circom` proves an update to one hidden per-TIN portfolio head. The outer authenticated map has one leaf per hidden TIP route. Each leaf commits to the route key commitment, sequence, previous Memo and action commitments, and a root for that TIN's token-balance commitment map. The nested map has one BabyJubjub Pedersen balance commitment per TCAP token ID. No per-TIN or per-transaction balance PDA is introduced.

## Public inputs

The nine public inputs are ordered exactly as the GPRU, TSN, TCAP, and SDK proof ABIs:

1. `oldGlobalRoot`
2. `newGlobalRoot`
3. `memoCommitment` (SHA-256 of the complete Memo, reduced to the BN254 scalar field)
4. `actionCommitment`
5. `nullifier`
6. `tipRouteRoot`
7. `successorPortfolioRoot`
8. `successorBalanceX` for the selected token
9. `successorBalanceY` for the selected token

The Memo starts with `TSN_GPRU_HEAD_V1:<portfolio-root>:<balance-x>:<balance-y>:<action-commitment>:` followed by the Base64URL DBrix Ledger stream. GPRU parses the four values, checks them against the public inputs, and hashes the complete instruction data for `memoCommitment`; the SHA-256 digest is reduced modulo the BN254 scalar modulus as the public field input. The owner action record stores the same canonical field encoding for its predecessor Memo link.

## What the proof establishes

The witness proves that the hidden active TIP route is a member of the shared TIP route root, the supplied route leaf is the current leaf in the old shared TCAP root, its sequence advances once, and a fresh nullifier is inserted. It also proves a token-map update under the predecessor portfolio root and binds the selected token's successor Pedersen point to the action:

- Credit adds `amount * G` and a fresh, nonzero blinding delta to the predecessor point. The prover needs the predecessor point but not the balance or its prior blinding opening; the owner applies the encrypted delta to its locally held opening.
- Debit and exit open predecessor and successor balances privately, constrain both to unsigned 64-bit values, and prove the successor is nonnegative and differs by the authorized amount.
- Other token commitments remain in the same nested map; a first credit for a token uses an empty token leaf.

The circuit uses additive homomorphic **Pedersen commitments**, not encrypted balance ciphertexts. A commitment hides its opening but cannot be decrypted. Each Memo instead carries an owner-encrypted action record containing the token action and blinding delta. For credit, the fresh delta randomizes the successor point and the owner updates its known opening by adding that delta; the prover does not need the prior opening. Debit and exit proofs open predecessor and successor points privately, prove the amount subtraction and nonnegative successor, and bind the blinding transition. The owner decrypts the history and replays the actions to recover numeric balances. The commitment point in the Memo prefix is a proof binding, not an encryption.

The circuit does not prove token custody, reserve solvency, or TCAP liquidity. TCAP must enforce accepted assets, authorization, reserve conditions, and the shared-root update atomically. The circuit source and ABI alone do not enable a settlement path.

## Witness fields

The witness includes TIP membership data, the hidden route and current outer-head leaf, the outer-map path, the predecessor portfolio root, the selected token's prior point and 32-level token-map path, the hidden nullifier path, and action openings. The first route head must use the canonical empty portfolio root; a previously unseen token must use an empty token leaf. These checks prevent a prover from choosing arbitrary predecessor state.

## Build and setup

Compile using the pinned Circom and `circomlib` versions in `package.json`:

```sh
npm run gpru:circuit:compile
npm run gpru:prover:setup:dev
```

The development setup is not a production ceremony. This circuit change requires recompilation and a new circuit-specific proving/verifying key pair, followed by verifier-argument export, matching GPRU verifier configuration, and review of the exact public-input order. Existing 2026-10-31 setup artifacts are stale for this circuit change; generate the new setup into a new `GPRU_DEV_SETUP_DIR` so the old setup is preserved. The setup metadata binds the R1CS, witness-calculator WASM, proving key, and verification key, and the prover checks those hashes before generating a proof. The Node remains fail-closed until a trusted latest-head/token-map witness provider and matching proof generation are connected.
