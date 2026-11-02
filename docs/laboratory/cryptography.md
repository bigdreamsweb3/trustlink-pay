# Cryptographic mechanisms and privacy boundaries

**Status: CURRENT source relations; local proving has a dated VERIFIED experiment; production cryptographic review remains UNVERIFIED.** Different mechanisms protect different data. Their names must not be used interchangeably as a general anonymity guarantee.

## Identity confidentiality and signatures

TIP identity envelopes use AES-GCM through WebCrypto in the SDK. Their keys are derived with domain-separated hashing of protected lookup material and the TIN; encryption/decryption also validates the recovered TIN/name binding. Lookup commitment and encryption are separate operations. Protected lookup material remains with the trusted issuer and Node. Owner recovery uses its versioned wallet-authorized envelope independently of that lookup secret.

Wallet payment and owner-intent approval use Ed25519 signatures at their relevant Solana/service boundaries. Node's verification attestation also uses Ed25519 but signs a different canonical projection. Mother authorization is enforced by the TSNP signer/account constraints. Worker API keys and Cranker challenge/session tokens provide service access; they are not substitutes for wallet authorization or a valid transition proof.

## Hidden authenticated maps

The circuit represents private latest heads and consumed nullifiers inside authenticated trees, with a global TCAP root derived from their roots. A head commits a hidden route key, sequence, previous Memo/action commitments and a portfolio root. A token portfolio commits a selected token's Pedersen point. The route tree proves membership in TIP's shared append root. Node reconstructs these roots from supplied snapshots before using a witness.

Snapshots are not authority merely because they have a plausible filename. `HiddenHeadWitnessStore` checks supported fields, size limits, duplicate keys, canonical scalars, points, sparse indices and exact recomputed root equality. Its candidate publisher does not mutate chain state. Chain-selected root continuity is essential to prevent stale balances or replayed deposit nullifiers from being treated as current.

## Pedersen balance and recoverable delta

Balance commitments use additive BabyJubjub points. A credit adds the amount contribution and a fresh blinding delta contribution to the selected token point. The authenticated TIP route includes the owner's scan public point `S = s * Base8`. The action publishes `E = e * Base8` and the field ciphertext `C = delta + x(e * S) mod q`. The circuit constrains those values to the same private delta used in the balance transition. The owner recovers `delta = C - x(s * E) mod q` with owner-held scan material.

This relation fixes a specific source-design failure: simply hashing a Memo containing an independently encrypted delta would bind the ciphertext bytes without proving that its plaintext matched the Pedersen transition. The encrypted action body now excludes that second delta. The [delta experiment record](experiments/EXP-20261101-delta-binding.md) preserves the finding and the evidence scope.

The relation does not prove every decrypted action-body field by itself. Owner recovery validates the payload's action/authorization commitments, token, amount, sequence and predecessor linkage against the settlement statement. A decryptable record with inconsistent fields must be rejected.

## Ordered public inputs and Memo

The current circuit publishes these twelve fields in order:

1. Previous global TCAP root.
2. Successor global TCAP root.
3. Complete Memo commitment reduced to a BN254 scalar.
4. Action commitment.
5. Nullifier.
6. TIP route root.
7. Successor portfolio root.
8. Successor balance point X.
9. Successor balance point Y.
10. Encrypted blinding delta.
11. Delta ephemeral point X.
12. Delta ephemeral point Y.

The Memo prefix carries the portfolio root, balance point, action commitment, ciphertext and ephemeral point; its body carries the owner-encrypted action record. GPRU hashes the complete Memo and binds the seven prefix fields to the proof. Its current instruction ordering requires the canonical Memo immediately after the top-level authorized TSNP call. Memo data remains visible as transaction bytes even when the body is confidential.

## Groth16, keys and what verification establishes

Circom compiles the arithmetic circuit to R1CS and witness WASM. `snarkjs` generates and verifies Groth16 proofs using a circuit-specific development proving key and verification key. GPRU uses `groth16-solana` to verify encoded proof points and twelve inputs against its initialized verifier account. Thirteen IC points are required for twelve inputs.

The November 2 experiment verified that the November 1 development R1CS/WASM artifacts matched a fresh compilation and that the existing development key passed `zkey verify`. Local proof creation and serialized reverification passed. That result supports reusing the development setup for the matching circuit. It does not establish a production ceremony, independent circuit soundness review, successful on-chain compute execution or complete settlement.

Key metadata, source hash, verification-key conversion and on-chain verifier bytes must agree. The older October 31 eight-input setup is incompatible with the current twelve-input circuit. The [prover readiness record](experiments/EXP-20261102-hidden-head.md) retains the exact result and the operational gates.

## Public deposit-to-credit nullifier link

Node `_settlement_funding_context` derives the public nullifier as the BN254 scalar reduction of SHA-256 over `TSN_GPRU_CONFIRMED_DEPOSIT_NULLIFIER_V1` followed by a zero byte, TCAP program public-key bytes and decoded confirmed deposit-signature bytes. All of those inputs are public. An observer can recompute it for a deposit and compare it to the credit statement/TSNP arguments. This supplies replay binding and also a funding-to-credit link; it contradicts a blanket claim that no public link connects those transactions. It does not by itself reveal the private TIN witness. The relationship is established by [current Node source](../../tsn-protocol/services/tsn-node/server.py) and [the public credit arguments](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs); no live correlation experiment is claimed.

## Visibility and trust

Solana exposes signatures, accounts, instructions, amounts selected by the ABI, root progression, nullifiers, proof points and encrypted Memo bytes. A shared root hides a direct per-TIN latest-head account in this credit ABI, but reveals global ordering and participation. Funding wallets and wallet output boundaries remain visible. Public data, time, application logs or authorized Node knowledge can still support correlation.

Node resolves identities and prepares sensitive witness material. Receiver handles ingress and encrypts durable funding bodies for Node. Cranker receives only the signed execution projection required for submission. The owner needs complete enough transaction history to recover balances; a valid individual proof cannot establish scanner completeness. Confidential debit, exit and general cross-chain conservation remain separate unverified execution paths.

## Source reference

See [TIN envelope/resolution](../../tsn-protocol/sdks/tsn-sdk/src/tins.ts), [Node record encryption](../../tsn-protocol/services/tsn-node/dbrix_transaction_record.py), [Node cryptography](../../tsn-protocol/services/tsn-node/gpru_crypto.py), [delta recovery](../../tsn-protocol/sdks/tsn-sdk/src/gpru/babyjub-delta-cipher.ts), [owner transaction record](../../tsn-protocol/sdks/tsn-sdk/src/gpru/transaction-record.ts), [witness store](../../tsn-protocol/services/tsn-node/hidden_head_witness.py), [circuit](../../tsn-protocol/programs/gpru/circuits/hidden_head_v1/main.circom), and [GPRU verifier](../../tsn-protocol/programs/gpru/src/hidden_head.rs).
