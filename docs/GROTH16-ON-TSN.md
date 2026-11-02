# Groth16 proofs in TSN

GPRU uses Groth16 to guard the integrity and privacy of the user's private state presented to TCAP for a balance-changing action. The proof is intended to establish that the hidden TIN portfolio head is current and that the proposed transition follows from it, without exposing the TIN or hidden per-TIN state in the proof. TCAP remains responsible for accepted assets, authorization, reserve liquidity, and atomic settlement. The proof path remains fail-closed until prover, witness, verifier setup, and end-to-end execution are verified. The native-credit proof hides the recipient TIN route and private predecessor witness from the on-chain statement. The owner retains private recovery/history material. However, Node derives the published nullifier from the public deposit signature and TCAP program ID, so an observer can compute the funding-to-credit link without a secret. Amount, asset, shared roots, successor point, ciphertext, accounts and timing are also visible, and the authorized Node handles private resolution/witnesses. Direct wallet transfers expose their endpoints; confidential debit and exit require separate execution evidence. The implemented source does not establish general unlinkability, owner-only knowledge or completed live settlement. Required artifact/witness settings and matching chain/verifier state remain runtime gates; see the [canonical privacy record](./laboratory/cryptography.md).

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

The local Node witness/prover adapters are implemented, and the November 2 experiment verified the matching November 1 development setup, local proofs and four SBF builds. Runtime configuration, deployed verifier/root state and confirmed settlement are separate gates; see [the dated readiness record](./laboratory/experiments/EXP-20261102-hidden-head.md). Independent review, matching verifier initialization, runtime settings and confirmed settlement must be verified before claiming live support.

## Further reading

- [GPRU hidden-head circuit](../tsn-protocol/programs/gpru/circuits/hidden_head_v1/README.md)
- [GPRU portfolio and proof contract](./GPRU-PORTFOLIO-PROOF-CONTRACT.md)
- [GPRU prover and key artifact guide](./GROTH16-PROVER-AND-KEY-ARTIFACTS.md)
- [Current architecture](./CURRENT-ARCHITECTURE.md)
