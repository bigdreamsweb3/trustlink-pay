# Groth16 proofs in TSN

GPRU uses Groth16 to guard the integrity and privacy of the user's private state presented to TCAP for a balance-changing action. The proof is intended to establish that the hidden TIN portfolio head is current and that the proposed transition follows from it, without exposing the TIN or hidden per-TIN state in the proof. TCAP remains responsible for accepted assets, authorization, reserve liquidity, and atomic settlement. The proof path remains fail-closed until prover, witness, verifier setup, and end-to-end execution are verified; public fields and the shared TCAP root can still reveal activity and correlation.

## Balance representation

Each token balance is represented in the circuit by a BabyJubjub Pedersen commitment, `C = amount * G + blinding * H`. The circuit proves additive updates to that commitment and nonnegative debit/exit successors. This is a homomorphic commitment, not an encrypted balance. It cannot be decrypted.

The Memo contains an owner-encrypted action record in DBrix Ledger data. It carries the action fields but omits the Pedersen blinding delta. The Memo prefix carries a one-time encrypted delta and ephemeral point; Groth16 proves they encrypt the exact private delta used by the Pedersen transition. The wallet decrypts the record, recovers the delta from that ciphertext using its TIP-registered scan secret, checks the action against on-chain settlement fields and the proof-bound action commitment, validates private history links, and replays amounts by TCAP token ID. The SDK helper requires the caller to provide matching on-chain action fields; it does not fetch history or guarantee the completeness of an RPC scan.

## Hidden state and proof statement

The shared authenticated state has one hidden outer leaf per TIN route. The leaf commits to a sequence, predecessor Memo/action commitments, and a root for the TIN's token commitment map. A transition proves active TIP route membership, current-head membership under the old root, one sequence advance, selected-token commitment arithmetic and nested-map root update, and one-time nullifier insertion under the new root.

The circuit's twelve public inputs, in ABI order, are:

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

The Memo starts with `TSN_GPRU_HEAD_V1:<successorPortfolioRoot>:<successorBalanceX>:<successorBalanceY>:<actionCommitment>:<encryptedBlindingDelta>:<deltaEphemeralPublicX>:<deltaEphemeralPublicY>:`. GPRU parses and compares all seven fields to the public inputs, then hashes all Memo bytes. The complete encoded body is therefore bound to the proof. The portfolio predecessor root, route, sequence, and authenticated-map paths stay private.

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

The source now defines a twelve-input Pedersen commitment circuit, matching GPRU/TSNP/TCAP proof argument sizes, the proof-bound one-time delta ciphertext, and SDK owner balance-history recovery. R1CS generation succeeded. The former Ristretto ElGamal portfolio updater was removed because its ciphertext arithmetic was unrelated to the BabyJubjub circuit statement; Ristretto remains in the separate DNA and record-key paths.

Settlement remains fail-closed. The Node does not yet provide an authenticated latest-head and token-map witness or generate a proof for the current shared state. Generate matching proving/verifying-key artifacts, independently review the circuit, build and verify all SBF programs, configure the on-chain verifier, and implement the trusted witness/prover service before claiming live settlement support. No deployment or live transaction is implied by these source changes.

## Further reading

- [GPRU hidden-head circuit](../tsn-protocol/programs/gpru/circuits/hidden_head_v1/README.md)
- [GPRU portfolio and proof contract](./GPRU-PORTFOLIO-PROOF-CONTRACT.md)
- [GPRU prover and key artifact guide](./GROTH16-PROVER-AND-KEY-ARTIFACTS.md)
- [Current architecture](./CURRENT-ARCHITECTURE.md)
