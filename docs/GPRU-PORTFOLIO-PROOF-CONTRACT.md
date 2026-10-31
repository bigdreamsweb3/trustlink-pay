# GPRU portfolio and proof contract

This contract aligns the hidden-head circuit, settlement Memo, and owner balance recovery. It uses an additive Pedersen commitment for the on-chain balance state and a separate owner-encrypted action record for numeric balance recovery. A Pedersen commitment is not a ciphertext and is not decrypted.

## Ownership and state

- **TIP** owns TIN identity, owner recovery, and route discovery. TIN is the 10-digit identity managed by TIP.
- **GPRU** derives transaction-specific routing material and verifies the proof that a hidden TIN portfolio head advances correctly.
- **TCAP** governs accepted token IDs, reserve liquidity, authorization, liability accounting, and atomic settlement state.
- **Memo** carries an owner-encrypted action record and the public proof binding. It is transaction instruction data; no balance PDA or per-transaction PDA is introduced.

The shared authenticated state has one hidden outer leaf per TIN route. That leaf commits to the hidden sequence, predecessor Memo/action commitments, and one root for the TIN's token map. The nested token map contains one Pedersen commitment point for each token that has a balance. Token IDs are TCAP's accepted `tokenId` values.

## Balance commitment and owner recovery

For token `t`, the circuit commits to amount `v` with a blinding scalar `r`:

```text
C_t = v * G + r * H
```

The circuit can add or subtract the public transaction amount by adding the corresponding multiple of `G`, then update the blinding by adding a fresh delta times `H`. Debit and exit proofs privately open old and new commitments and enforce a nonnegative successor. These are homomorphic **commitments**: they hide the amount and support arithmetic, but they do not encrypt or decrypt it.

Each Memo contains one DBrix Secretbox-encrypted `tsn-gpru-balance-action-v1` record. It includes action kind, token ID, amount in base units, the hidden per-TIN sequence and predecessor Memo commitment for local history validation, the action commitment, and the balance blinding delta. The owner derives the record key from their TIP-registered GPRU scan key material, decrypts the records, validates each record against its settlement instruction and proof-bound Memo action commitment, checks the private history links, and replays credits, debits, and exits by token ID.

The predecessor Memo commitment in the encrypted record is the big-endian SHA-256 digest reduced modulo the BN254 scalar modulus, exactly matching the value committed in the hidden-head circuit. The complete Memo hash includes the visible one-time prefix and encrypted Ledger body; GPRU applies the same field reduction before comparing it with the proof input. Each transition also uses a nonzero balance blinding delta, and the circuit proves its relation to the previous and next openings for all three action kinds.

The SDK recovery helper requires the caller to supply decrypted records with their corresponding on-chain action fields. It verifies those values agree, rejects sequence gaps or broken Memo-predecessor links, and rejects negative reconstructed balances. An RPC/indexer scanner must still fetch a complete history; the helper cannot prove an RPC scan is complete by itself.

## Hidden-head proof and Memo binding

The nine Groth16 public inputs are:

1. `oldGlobalRoot`
2. `newGlobalRoot`
3. `memoCommitment` (SHA-256 of the complete Memo, reduced to the BN254 scalar field)
4. `actionCommitment`
5. `nullifier`
6. `tipRouteRoot`
7. `successorPortfolioRoot`
8. `successorBalanceX`
9. `successorBalanceY`

The Memo begins with:

```text
TSN_GPRU_HEAD_V1:<successorPortfolioRoot>:<successorBalanceX>:<successorBalanceY>:<actionCommitment>:
```

The rest is the encoded DBrix Ledger stream holding the encrypted action. GPRU checks that the four prefix fields equal the proof's corresponding public inputs, hashes the entire Memo, and verifies the proof. The circuit proves TIP route membership, current-head membership under the old shared root, one sequence advance, selected-token commitment arithmetic and portfolio-root update, and one-time nullifier insertion under the new root.

The portfolio-root prefix is a fresh successor value. The predecessor root and route remain private witnesses, so the Memo does not repeat a stable per-TIN identifier. The public shared root still exposes that a global state transition occurred; traffic timing and other public transaction fields can also provide correlation signals.

## Atomic settlement and replay handling

TCAP checks the accepted asset, funding or owner authorization, reserve/liquidity conditions, and validity window. It verifies the GPRU proof and atomically advances the shared root with its liability accounting. Once the predecessor root advances, the same settlement cannot be applied again. A funding-derived commitment binds settlement authorization to its original funding without a separate spent-funding record.

The GPRU proof establishes balance commitment arithmetic and freshness. It does not prove token custody, reserve solvency, or that the Memo's Secretbox plaintext correctly represents the action. Owner recovery cross-checks decrypted action fields against the on-chain settlement instruction and action commitment. The Memo record is for owner-readable balance history; TCAP does not trust it to authorize liquidity movement.

## Current implementation status

The source now uses a nine-input circuit contract with one hidden outer TIN head and a nested per-token Pedersen commitment map. GPRU's Memo parser validates the portfolio-root, point, and action-commitment prefix. The Cranker Memo builder emits the same format. The SDK decrypts action records and reconstructs balances after checking action fields and private sequence/predecessor continuity. The Node record encoder rejects public portfolio ciphertexts, and the Ristretto portfolio balance updater has been removed; Ristretto remains for DNA routing and record-key agreement.

This does **not** enable settlement. The TSN Node still fails closed because a trusted provider for the latest hidden-head and nested token-map witness is not configured. The Groth16 circuit must be recompiled; a matching proving/verifying key must be generated; GPRU verifier configuration must match the new circuit; and Node/Cranker settlement serialization must be integrated and compiled. No SBF deployment, verifier initialization, end-to-end proof, or live credit/debit/exit result is claimed here.
