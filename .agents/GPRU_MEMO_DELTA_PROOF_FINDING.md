# Memo delta finding and dated verification checkpoints

**Status: source finding retained with HISTORICAL November 1 verification scope.** The relation described below remains the current owner-delta contract. Its original missing-witness/prover and no-local-proof statements describe that checkpoint, rather than today's source/configuration. Later [development setup evidence](../docs/laboratory/experiments/EXP-20261102-hidden-head.md) records matching fresh R1CS/WASM, development-key verification and local adapter tests. Do not overwrite the original experiment result with the later observation.

Use [current cryptography](../docs/laboratory/cryptography.md), [credit ABI](../docs/laboratory/credit-abi.md), [reconciliation](../docs/laboratory/reconciliation-register.md) and [documentation maintenance](../docs/DOCUMENTATION_MAINTENANCE.md). Node now has root-selected witness/prover adapters and remains fail-closed on missing prerequisites. On-chain verification/compute, current initialized accounts, complete credit and validated owner recovery require separate evidence. The public funding nullifier and transaction metadata limit privacy independently of the delta fix.

## Original finding and November 1 checkpoint

# GPRU Memo delta proof finding

## Resolution

**Fixed in source on 2026-11-01.** The BabyJubjub circuit, TIP route data, Memo prefix, GPRU verifier, Node record format, Cranker serialization, and owner SDK recovery now share one relation for the Pedersen blinding delta. The encrypted owner action payload no longer carries a second, independently supplied delta.

For a private scan scalar `s`, TIP registers `S = s * Base8` in the authenticated route leaf. Each action chooses a fresh private scalar `e`, publishes `E = e * Base8`, and publishes `C = delta + x(e * S) mod q`. The Groth16 witness uses this same `delta` in the Pedersen successor and proves the ciphertext equation. GPRU binds `C` and `E` to the Memo prefix and hashes the complete Memo. The owner computes `delta = C - x(s * E) mod q` and uses the recovered value when replaying the decrypted action history.

This fixes the original source-level mismatch: hashing a Memo that contained an unrelated encrypted delta was insufficient, but the revised circuit now proves that the owner-recoverable ciphertext contains the exact private delta used by the Pedersen transition. It does not prove that every Secretbox plaintext action field matches the on-chain action; the owner SDK checks those fields against the settlement statement and proof-bound action commitment.

## Cross-layer source contract

- `tsn-protocol/programs/gpru/circuits/hidden_head_v1/main.circom` constrains the ciphertext and ephemeral point to the private delta and scan point used in the transition. The public input count is twelve.
- `tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs`, `processor/create_tin_v1.rs`, `processor/tin_v1_creation_staging.rs`, and `route_root.rs` carry and authenticate the versioned BabyJubjub scan public point in TIN creation and the shared TIP route leaf.
- `tsn-protocol/programs/gpru/src/hidden_head.rs` checks the twelve public inputs, parses seven fixed Memo-prefix values, and hashes the complete Memo bytes.
- `tsn-protocol/services/tsn-node/dbrix_transaction_record.py` excludes the delta from the encrypted action payload and serializes the ciphertext and ephemeral point into the Memo prefix. `gpru_crypto.py` implements compatible one-time encryption and point validation.
- `tsn-protocol/services/tsn-cranker-op-daemon/scripts/cranker.ts` and `src/dbrix/settlement-memo.ts` preserve the three new public inputs in Memo construction.
- `tsn-protocol/sdks/tsn-sdk/src/gpru/babyjub-delta-cipher.ts` derives the owner scan key and recovers the delta. `transaction-record.ts` validates the encrypted payload without accepting an embedded delta; `balance-history.ts` uses only the recovered delta.

## Verification and remaining limits

- Python syntax compilation passed for the Node record, crypto, and server modules.
- TypeScript builds passed for the TSN SDK and Cranker before the final change that removed the embedded-delta fallback. Rebuild those packages to verify the final source.
- The updated Circom source compiled to R1CS and symbols in a separate verification directory: twelve public inputs, 165,496 non-linear constraints, 348 private inputs (346 witness inputs), and 165,756 wires. WASM generation and proof generation were not part of this compile.
- No Groth16 proof has been generated or verified against the updated circuit. The Node remains fail-closed because no trusted latest-head/token-map witness source and configured prover are connected. SBF builds, verifier initialization, deployment, and end-to-end settlement are not verified.
- The public action kind, token ID, amount, nullifier, shared roots, route root, successor point, ciphertext, timing, and transaction accounts remain observable. The shared writable root also exposes global state progression; this design does not guarantee zero linkability.

Do not revert to publishing the raw delta or adding a stable per-TIN ciphertext key. Do not describe settlement as enabled until the latest circuit, setup artifacts, witness/prover flow, SBF verifier, and complete on-chain transition have been verified.
