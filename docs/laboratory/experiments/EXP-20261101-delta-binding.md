# EXP-20261101: binding the owner delta to the proved transition

**Known period: source fix recorded 2026-11-01. Outcome: source relation revised; the original finding's date and full experiment log are not established.** This record reconstructs the question from [.codex/GPRU_MEMO_DELTA_PROOF_FINDING.md](../../../.codex/GPRU_MEMO_DELTA_PROOF_FINDING.md) and current source. It does not invent the time of initial discovery or claim the original document is up to date about later test results.

## Problem and hypothesis

The earlier design hashed a Memo carrying an independently encrypted blinding delta. Hashing those ciphertext bytes did not prove that the decrypted delta was the one used in the Pedersen successor. An owner could therefore receive a decryptable record that did not permit consistent balance replay. The revised hypothesis was that the circuit must prove an owner-recoverable ciphertext relation using the exact transition delta.

The initial approach is documented as a source-level mismatch, not a successful deployed experiment. Its important lesson is that byte commitment and plaintext arithmetic consistency are different claims.

## Revised setup and implementation

TIP registers the scan point `S = s * Base8` in its authenticated route. Each action selects fresh private scalar `e`, publishes `E = e * Base8` and `C = delta + x(e * S) mod q`, and constrains that relation in the circuit. The same delta appears in the additive Pedersen successor. Owner SDK recovery computes `delta = C - x(s * E) mod q` and rejects payloads attempting to supply another delta.

This changed the circuit public-input count to twelve and changed the TIP route leaf to include scan-point coordinates. Node Memo creation, GPRU prefix checks, Cranker serialization and owner recovery share that relation. The encrypted body contains action metadata while the delta ciphertext is proof-bound in the prefix.

## Observations and limits

The finding recorded source syntax checks and a successful R1CS compile, but not WASM generation, a generated proof, SBF deployment or end-to-end settlement. Those were the observation limits of that record. The later [November 2 experiment](EXP-20261102-hidden-head.md) supplies local WASM/key/proof/build evidence; it does not retroactively change the original experiment's observations.

The relation binds the recoverable delta, not every encrypted body field. Owner action validation remains necessary. Public amount/action fields, roots, points, ciphertext, accounts and ordering remain visible, and complete history retrieval remains a separate dependency.

## Decision and learning

The revised source uses one proof-bound delta and removes the independently supplied encrypted-delta fallback. Future changes must preserve the shared circuit, TIP route, Memo, verifier and owner-recovery contract. Publishing a raw delta or accepting a second payload delta would reintroduce the failed boundary.

Evidence: [circuit](../../../tsn-protocol/programs/gpru/circuits/hidden_head_v1/main.circom), [TIP route leaf](../../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/route_root.rs), [GPRU verifier](../../../tsn-protocol/programs/gpru/src/hidden_head.rs), [Node record](../../../tsn-protocol/services/tsn-node/dbrix_transaction_record.py), [owner delta recovery](../../../tsn-protocol/sdks/tsn-sdk/src/gpru/babyjub-delta-cipher.ts), and [owner history](../../../tsn-protocol/sdks/tsn-sdk/src/gpru/balance-history.ts).
