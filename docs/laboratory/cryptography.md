# Cryptographic mechanisms and privacy boundaries

**Status: EXPERIMENTAL private-credit/epoch source, reviewed 2026-11-07.** [Isolated real proofs and native verification](experiments/EXP-20261107-private-credit-epoch.md) provide bounded local evidence. SBF compilation, live activation, complete payment/accounting and independent cryptographic review remain unverified.

## Identity confidentiality and signatures

TIP identity envelopes use AES-GCM through WebCrypto in the SDK. Their keys are derived with domain-separated hashing of protected lookup material and the TIN; encryption/decryption also validates the recovered TIN/name binding. Lookup commitment and encryption are separate operations. Protected lookup material remains with the trusted issuer and Node. Owner recovery uses its versioned wallet-authorized envelope independently of that lookup secret.

Wallet payment and owner-intent approval use Ed25519 signatures at their relevant Solana/service boundaries. Node's verification attestation also uses Ed25519 but signs a different canonical projection. Mother authorization is enforced by the TSNP signer/account constraints. Worker API keys and Cranker challenge/session tokens provide service access; they are not substitutes for wallet authorization or a valid transition proof.

## Hidden authenticated maps

The circuit represents private latest heads and consumed nullifiers inside authenticated trees, with a global TCAP root derived from their roots. A head commits a hidden route key, sequence, previous Memo/action commitments and a portfolio root. A token portfolio commits a selected token's Pedersen point. The route tree proves membership in TIP's shared append root. Node reconstructs these roots from supplied snapshots before using a witness.

Snapshots are not authority merely because they have a plausible filename. `HiddenHeadWitnessStore` checks supported fields, size limits, duplicate keys, canonical scalars, points, sparse indices and exact recomputed root equality. Its candidate publisher does not mutate chain state. Chain-selected root continuity is essential to prevent stale balances or replayed deposit nullifiers from being treated as current.

## Pedersen balance and recoverable delta

Balance commitments use additive BabyJubjub points. A credit adds the amount contribution and a fresh blinding delta contribution to the selected token point. The authenticated TIP route includes the owner's scan public point `S = s * Base8`. The action publishes `E = e * Base8` and the field ciphertext `C = delta + x(e * S) mod q`. The circuit constrains those values to the same private delta used in the balance transition. The owner recovers `delta = C - x(s * E) mod q` with owner-held scan material.

This relation fixes a specific source-design failure: simply hashing a Memo containing an independently encrypted delta would bind the ciphertext bytes without proving that its plaintext matched the Pedersen transition. The encrypted action body now excludes that second delta. The [delta experiment record](experiments/EXP-20261101-delta-binding.md) preserves the finding and the evidence scope.

The relation does not prove every decrypted action-body field by itself. Owner recovery validates action/authorization commitments, token, amount commitment/opening, sequence and predecessor linkage against the settlement statement. A decryptable record with inconsistent fields must be rejected.

## Ordered public inputs and Memo

The funded-note circuit publishes these thirteen fields in order:

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
13. Immutable sealed TCAP funding root.

The Memo prefix carries the portfolio root, balance point, action commitment, ciphertext and ephemeral point; its body carries the owner-encrypted action record. GPRU hashes the complete Memo and binds the seven prefix fields to the proof. Its current instruction ordering requires the canonical Memo immediately after the top-level authorized TSNP call. Memo data remains visible as transaction bytes even when the body is confidential.

## Groth16, keys and what verification establishes

Circom compiles the arithmetic circuit to R1CS and witness WASM. `snarkjs` generates and verifies Groth16 proofs using a circuit-specific development proving key and verification key. GPRU uses `groth16-solana` to verify encoded proof points and thirteen inputs against its V2 verifier account. Fourteen IC points are required; the new circuit requires a matching circuit-specific key.

November 2–5 proof/receipt results belong to earlier amount-public circuits. The November 7 replacement compiled 174,421 nonlinear credit constraints and 42,614 epoch constraints and passed real Groth16 proof/serialized reverification against isolated matching development keys. These single-machine keys do not establish a production ceremony or independent soundness review; exact hashes and check scope are recorded in [the experiment](experiments/EXP-20261107-private-credit-epoch.md).

Key metadata, source hash, verification-key conversion and on-chain verifier bytes must agree. The older eight/twelve-input setups are incompatible with the thirteen-input runtime. Verifier migration is a separate Mother-authorized operation at the same PDA; it creates a disabled V2 header before bounded IC uploads and commitment-checked enabling. Existing TCAP state is not reset.

## Proof-enforced funded notes

The SDK samples a private nonzero BN254 secret and blinding field and computes `note = Poseidon3(NOTE_DOMAIN, secret, blinding)`. The domains are the ASCII big-endian field values `TSN_FUNDING_NOTE_V1`, `TSN_FUNDED_LEAF_V1` and `TSN_FUNDING_NULLIFIER_V1`. The wallet signs the note commitment in both its canonical payment message and exact TCAP deposit. Node verifies the opening against both signed commitments; restricted ingress transports the opening to Node, while Receiver stores it only inside the encrypted Node envelope.

After verifying the actual vault transfer delta, TCAP appends `leaf = Poseidon4(FUNDED_LEAF_DOMAIN, note, registered_token_id, actual_amount)` to its governed depth-32 funding tree atomically with the deposit accounting. The sender therefore cannot manufacture a higher amount inside its own commitment. For credit, the circuit privately reconstructs the note and funded leaf, proves membership under the chain-selected funding root, binds the leaf's asset/amount to the authorized action, and enforces `nullifier = Poseidon2(NULLIFIER_DOMAIN, secret)`. It then consumes that value in the existing hidden nullifier map. Changing a work ID, Node, recipient or retry root cannot create a new nullifier for the same secret.

Credit publishes a sealed funding root and secret-derived nullifier while excluding the note commitment, leaf/index and opening. Its amount commitment is `Poseidon5(TSN_CREDIT_VALUE_V2, tokenId, amount, privateBlinding, nullifier)` with fresh nonzero canonical blinding; action commitment and TSNP digest bind that commitment. This removes the old signature-nullifier and unblinded amount-guessing formulas in source. Deposit amounts and aggregate totals remain public; timing, recipient-registry/head correlations and authorized Node knowledge remain separate limits.

Node reconstructs public funded snapshots from successful invocation-bound TCAP append history and verifies their root/count. Bounds remain 10,000 leaves/signatures. Mother-authorized pool capture pins the chain-current root after validating two positive unspent member notes and two wallet sources; later appends cannot alter it. Missing history or a nonmember opening stops proving. Old signature-only deposits require separate handling.

## Funding-root anonymity-set boundary

A public funding root identifies the eligible deposit set; hiding its selected leaf does not hide a set of size one. The [November 5 public-only regression](experiments/EXP-20261103-funded-note-credit.md#public-only-deposit-to-credit-regression-2026-11-05) reproduces both old signature-derived nullifier controls and confirms that the new nullifier differs, while independently reconstructing the new credit's funding root from its sole index-zero deposit. The on-chain funding account contains one leaf, so the supplied pair remains publicly linkable by membership. For a larger set, a shared root alone does not identify which deposit was consumed, but visible token/amount, timing and known prior spends can narrow candidates. No multi-deposit anonymity guarantee follows from this check.

## Historical public deposit-to-credit nullifier link

The superseded Node `_settlement_funding_context` derived the public nullifier as the BN254 scalar reduction of SHA-256 over `TSN_GPRU_CONFIRMED_DEPOSIT_NULLIFIER_V1` followed by a zero byte, TCAP program public-key bytes and decoded confirmed deposit-signature bytes. All inputs were public. Recomputing the nullifier from the [first finalized credit's funding signature](experiments/EXP-20261102-native-credit-baseline.md#deposit-derived-nullifier) matched its public credit argument and proof exactly. That dated result establishes replay binding and a funding-to-credit link for the old baseline, without by itself revealing the recipient TIN. The formula was present before confirmation/receipt repair and has now been removed from the native credit runtime.

The same finalized transaction carries `100000` in its TSNP amount argument, proof structure and TCAP CPI, representing 0.1 Devnet USDC. Its authorization digest and action commitment also recomputed from public fields. An encrypted owner record and circuit-private signal cannot hide a separately public instruction argument. The [93-field map and comparison protocol](experiments/EXP-20261102-native-credit-baseline.md) retain the exact disclosures and distinguish funding-wallet linkage from recipient identification; a second-credit trial and owner recovery remain unverified.

## Visibility and trust

The [November 3 linkage investigation](experiments/EXP-20261103-native-credit-linkability.md) reproduced the first finalized credit's successor global root from a public TIP registry key, public statement fields and verified empty initial maps. This links that credit to a persistent recipient registry without recovering its plaintext TIN. Fourteen offline structural controls also reproduced later same-registry and cross-asset portfolio correlations under known-history/known-portfolio assumptions. Keeping a route key outside proof public inputs does not hide it when the same key is enumerable in public registry state and its head commitment has no unknown opening. Accepted proof verification does not establish recipient unlinkability.

Solana exposes signatures, accounts, instructions, amounts selected by the ABI, root progression, nullifiers, proof points and encrypted Memo bytes. A shared root hides a direct per-TIN latest-head account in this credit ABI, but reveals global ordering and participation. Funding wallets and wallet output boundaries remain visible. Public data, time, application logs or authorized Node knowledge can still support correlation.

Node resolves identities and prepares sensitive witness material. Receiver handles ingress and encrypts durable funding bodies for Node. Cranker receives only the signed execution projection required for submission. The owner needs complete enough transaction history to recover balances; a valid individual proof cannot establish scanner completeness. Confidential debit, exit and general cross-chain conservation remain separate unverified execution paths.

## Source reference

See [TIN envelope/resolution](../../tsn-protocol/sdks/tsn-sdk/src/tins.ts), [Node record encryption](../../tsn-protocol/services/tsn-node/dbrix_transaction_record.py), [Node cryptography](../../tsn-protocol/services/tsn-node/gpru_crypto.py), [delta recovery](../../tsn-protocol/sdks/tsn-sdk/src/gpru/babyjub-delta-cipher.ts), [owner transaction record](../../tsn-protocol/sdks/tsn-sdk/src/gpru/transaction-record.ts), [witness store](../../tsn-protocol/services/tsn-node/hidden_head_witness.py), [circuit](../../tsn-protocol/programs/gpru/circuits/hidden_head_v1/main.circom), and [GPRU verifier](../../tsn-protocol/programs/gpru/src/hidden_head.rs).
