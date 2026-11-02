# GPRU portfolio and proof contract

This contract aligns the hidden-head circuit, settlement Memo, and owner balance recovery. It uses an additive Pedersen commitment for the on-chain balance state and a separate owner-encrypted action record for numeric balance recovery. A Pedersen commitment is not a ciphertext and is not decrypted.

## Ownership and state

- **TIP** owns TIN identity, owner recovery, and route discovery. TIN is the 10-digit identity managed by TIP.
- **GPRU** guards the integrity and privacy of the user's private portfolio state presented to TCAP. Its proof is intended to establish that the hidden head is current and that the proposed balance transition follows from it, without exposing the TIN or hidden per-TIN state in the proof.
- **TCAP** governs accepted token IDs, reserve liquidity, authorization, liability accounting, and atomic settlement state.
- **Memo** carries an owner-encrypted action record and the public proof binding. It is transaction instruction data; no balance PDA or per-transaction PDA is introduced.

In plain terms, GPRU verifies the private state transition that TCAP relies on; TCAP governs the funds and applies the authorized transition atomically. The native-credit proof hides the recipient TIN route and private predecessor witness from the on-chain statement. The owner retains private recovery/history material. However, Node derives the published nullifier from the public deposit signature and TCAP program ID, so an observer can compute the funding-to-credit link without a secret. Amount, asset, shared roots, successor point, ciphertext, accounts and timing are also visible, and the authorized Node handles private resolution/witnesses. Direct wallet transfers expose their endpoints; confidential debit and exit require separate execution evidence. The implemented source does not establish general unlinkability, owner-only knowledge or completed live settlement. Required artifact/witness settings and matching chain/verifier state remain runtime gates; see the [canonical privacy record](./laboratory/cryptography.md).

The shared authenticated state has one hidden outer leaf per TIN route. That leaf commits to the hidden sequence, predecessor Memo/action commitments, and one root for the TIN's token map. The nested token map contains one Pedersen commitment point for each token that has a balance. Token IDs are TCAP's accepted `tokenId` values.

## Balance commitment and owner recovery

For token `t`, the circuit commits to amount `v` with a blinding scalar `r`:

```text
C_t = v * G + r * H
```

The circuit can add or subtract the public transaction amount by adding the corresponding multiple of `G`, then update the blinding by adding a fresh delta times `H`. Debit and exit proofs privately open old and new commitments and enforce a nonnegative successor. These are homomorphic **commitments**: they hide the amount and support arithmetic, but they do not encrypt or decrypt it.

Each Memo contains one DBrix Secretbox-encrypted `tsn-gpru-balance-action-v1` record. It includes action kind, token ID, amount in base units, the hidden per-TIN sequence and predecessor Memo commitment for local history validation, and the action commitment. It deliberately excludes the balance blinding delta. The public Memo prefix carries a one-time BabyJubjub ciphertext of that delta and its ephemeral point. The Groth16 witness proves this ciphertext encrypts the exact delta used by the Pedersen transition. The owner derives the TIP-registered scan secret from the master seed, recovers the delta from the ciphertext, decrypts the record, validates it against its settlement instruction and proof-bound action commitment, checks private history links, and replays credits, debits, and exits by token ID.

The predecessor Memo commitment in the encrypted record is the big-endian SHA-256 digest reduced modulo the BN254 scalar modulus, exactly matching the value committed in the hidden-head circuit. The complete Memo hash includes the visible one-time prefix and encrypted Ledger body; GPRU applies the same field reduction before comparing it with the proof input. Each transition also uses a nonzero balance blinding delta, and the circuit proves its relation to the previous and next openings for all three action kinds.

The SDK recovery helper requires the caller to supply decrypted records with their corresponding on-chain action fields. It verifies those values agree, rejects sequence gaps or broken Memo-predecessor links, and rejects negative reconstructed balances. An RPC/indexer scanner must still fetch a complete history; the helper cannot prove an RPC scan is complete by itself.

## Hidden-head proof and Memo binding

The twelve Groth16 public inputs are:

1. `oldGlobalRoot`
2. `newGlobalRoot`
3. `memoCommitment` (SHA-256 of the complete Memo, reduced to the BN254 scalar field)
4. `actionCommitment`
5. `nullifier`
6. `tipRouteRoot`
7. `successorPortfolioRoot`
8. `successorBalanceX`
9. `successorBalanceY`
10. `encryptedBlindingDelta`
11. `deltaEphemeralPublicX`
12. `deltaEphemeralPublicY`

The Memo begins with:

```text
TSN_GPRU_HEAD_V1:<successorPortfolioRoot>:<successorBalanceX>:<successorBalanceY>:<actionCommitment>:<encryptedBlindingDelta>:<deltaEphemeralPublicX>:<deltaEphemeralPublicY>:
```

The rest is the encoded DBrix Ledger stream holding the encrypted action. GPRU checks that all seven prefix fields equal the proof's corresponding public inputs, hashes the entire Memo, and verifies the proof. The circuit proves TIP route membership, current-head membership under the old shared root, one sequence advance, selected-token commitment arithmetic and portfolio-root update, the one-time ciphertext relation, and nullifier insertion under the new root.

The portfolio-root prefix is a fresh successor value. The predecessor root and route remain private witnesses, so the Memo does not repeat a stable per-TIN identifier. The public shared root exposes that a global state transition occurred, not which TIN changed or which private predecessor led to it. Timing and other transaction fields are visible, but they do not create a public recipient pointer.

## Atomic settlement and replay handling

TCAP checks the accepted asset, funding or owner authorization, reserve/liquidity conditions, and validity window. It verifies the GPRU proof and atomically advances the shared root with its liability accounting. Once the predecessor root advances, the same settlement cannot be applied again. A funding-derived commitment binds settlement authorization to its original funding without a separate spent-funding record.

The GPRU proof establishes balance commitment arithmetic and freshness, and proves the one-time Memo ciphertext encrypts the exact blinding delta used by the transition. It does not prove token custody, reserve solvency, or that every Secretbox plaintext action field correctly represents the on-chain action. Owner recovery cross-checks decrypted action fields against the on-chain settlement instruction and action commitment. The Memo record is for owner-readable balance history; TCAP does not trust it to authorize liquidity movement.

## Current implementation status

The source now uses a twelve-input circuit contract with one hidden outer TIN head, a nested per-token Pedersen commitment map, and a one-time ciphertext relation for its blinding delta. GPRU's Memo parser validates all seven public prefix fields. The Cranker Memo builder emits the same format. The SDK decrypts action records, recovers the delta from the prefix ciphertext, and reconstructs balances after checking action fields and private sequence/predecessor continuity. R1CS generation has succeeded; the Ristretto portfolio balance updater has been removed, while Ristretto remains for DNA routing and record-key agreement.

The local Node witness/prover adapters are implemented, and the November 2 experiment verified the matching November 1 development setup, local proofs and four SBF builds. Runtime configuration, deployed verifier/root state and confirmed settlement are separate gates; see [the dated readiness record](./laboratory/experiments/EXP-20261102-hidden-head.md). Production circuit review, matching initialized verifier, runtime settings and confirmed credit/debit/exit evidence remain separate requirements.
