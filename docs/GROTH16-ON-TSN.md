# Groth16 proofs in TSN

GPRU uses Groth16 to verify that a hidden TIN portfolio head advances according to a valid balance action. The proof hides the TIN route and its predecessor state. TCAP remains responsible for token acceptance, authorization, reserve liquidity, and atomic settlement.

## Balance representation

Each token balance is represented in the circuit by a BabyJubjub Pedersen commitment, `C = amount * G + blinding * H`. The circuit proves additive updates to that commitment and nonnegative debit/exit successors. This is a homomorphic commitment, not an encrypted balance. It cannot be decrypted.

The Memo contains an owner-encrypted action record in DBrix Ledger data. The record carries the action fields and blinding delta needed for owner recovery. The wallet decrypts its Memo history, checks each recovered action against the on-chain settlement fields and proof-bound action commitment, validates the private history links, and replays amounts by TCAP token ID. The SDK helper requires the caller to provide the matching on-chain action fields; it does not fetch history or guarantee the completeness of an RPC scan.

## Hidden state and proof statement

The shared authenticated state has one hidden outer leaf per TIN route. The leaf commits to a sequence, predecessor Memo/action commitments, and a root for the TIN's token commitment map. A transition proves active TIP route membership, current-head membership under the old root, one sequence advance, selected-token commitment arithmetic and nested-map root update, and one-time nullifier insertion under the new root.

The circuit's nine public inputs, in ABI order, are:

1. `oldGlobalRoot`
2. `newGlobalRoot`
3. `memoCommitment` (SHA-256 of the complete Memo, reduced to the BN254 scalar field)
4. `actionCommitment`
5. `nullifier`
6. `tipRouteRoot`
7. `successorPortfolioRoot`
8. `successorBalanceX`
9. `successorBalanceY`

The Memo starts with `TSN_GPRU_HEAD_V1:<successorPortfolioRoot>:<successorBalanceX>:<successorBalanceY>:<actionCommitment>:`. GPRU parses and compares that prefix to the public inputs, then hashes all Memo bytes. The complete encoded body is therefore bound to the proof. The portfolio predecessor root, route, sequence, and authenticated-map paths stay private.

The proof does not establish token custody, reserve solvency, or confidentiality of every transaction field. TCAP checks the accepted asset, funding or owner authorization, reserve/liquidity conditions, and validity window, then advances its shared root and liability state atomically. A stale predecessor cannot be settled again once the root advances.

## Setup artifacts

Groth16 uses a circuit-specific proving key off chain and a matching verifying key on chain. The proving key is not tied to the computer that created it; it can be transferred securely to another compatible prover. Production setup requires a publicly verifiable multi-party ceremony over the exact reviewed circuit. A one-machine development setup is only for toolchain integration and is not a production ceremony.

From the repository root:

```sh
npm run gpru:circuit:compile
npm run gpru:prover:setup:dev
```

Any circuit source or public-input change invalidates the previous circuit-specific keys and verifier arguments. Recompile, regenerate matching development artifacts, inspect the exported public-input count and encoding, and initialize GPRU only with the matching verifier configuration. Do not commit proving keys, private witnesses, ceremony secrets, or local development artifacts.

## Implementation status

The source now defines the nine-input Pedersen commitment circuit, matching GPRU/TSNP/TCAP proof argument sizes, the proof-bound Memo prefix, and SDK owner balance-history recovery. The former Ristretto ElGamal portfolio updater was removed because its ciphertext arithmetic was unrelated to the BabyJubjub circuit statement.

Settlement remains fail-closed. The Node does not yet provide an authenticated latest-head and token-map witness or generate a proof for the current shared state. Recompile the updated circuit, generate matching proving/verifying-key artifacts, build and verify all SBF programs, configure the on-chain verifier, and implement the trusted witness/prover service before claiming live settlement support. No deployment or live transaction is implied by these source changes.

## Further reading

- [GPRU hidden-head circuit](../tsn-protocol/programs/gpru/circuits/hidden_head_v1/README.md)
- [GPRU portfolio and proof contract](./GPRU-PORTFOLIO-PROOF-CONTRACT.md)
- [GPRU prover and key artifact guide](./GROTH16-PROVER-AND-KEY-ARTIFACTS.md)
- [Current architecture](./CURRENT-ARCHITECTURE.md)
