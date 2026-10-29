# GPRU hidden-head Groth16 circuit V1

`main.circom` defines the proof statement for a hidden latest-head transition. It proves that a hidden active TIP route belongs to the TIP-wide route tree, that the hidden TIN/asset leaf is the predecessor under TCAP's shared state root, that its sequence advances once with the submitted encrypted Memo commitment, and that a one-time nullifier is absent before being inserted. The updated head and nullifier subroots form the new shared TCAP root.

The six Groth16 public inputs are ordered as follows and must match GPRU's Rust ABI:

1. `oldGlobalRoot` (canonical big-endian BN254 scalar)
2. `newGlobalRoot` (canonical big-endian BN254 scalar)
3. `memoCommitment` (SHA-256 of the following Memo instruction, reduced modulo the BN254 scalar modulus)
4. `actionCommitment` (canonical big-endian BN254 scalar)
5. `nullifier` (fresh canonical big-endian BN254 scalar)
6. `tipRouteRoot` (canonical big-endian BN254 scalar)

The witness hides the TIN route, TIP append index, asset leaf, predecessor memo/action commitment, per-TIN sequence, and all three sparse-tree paths. The nullifier is a fresh public random value; it must not be derived from a TIN, route key, or stable wallet address. TIP assigns route indices when TINs are created and publishes only one protocol-wide Merkle root and append frontier.

GPRU recomputes `actionCommitment` as `Poseidon(actionKind, tokenId, amount, authorizationCommitment, nullifier)`. Action kinds are versioned as credit `1`, debit `2`, and exit `3`. TCAP/TSN must provide the exact action fields bound by their authorization before calling the verifier.

## Scope and security boundary

This circuit proves latest-head freshness, route membership against a shared TIP root, and one-time nullifier insertion. It does **not** prove homomorphic balance arithmetic, sufficient balance, token custody, or TCAP liquidity. TCAP remains responsible for liquidity and atomic state-root advancement. A separate audited balance-transition proof is required before debit or exit can be enabled.

The GPRU verifier checks that `memoCommitment` matches the Memo instruction immediately following the top-level TSN instruction, using SHA-256-to-field reduction. The runtime verifier remains unusable until TIP publishes the specified shared route root, TCAP stores the corresponding Poseidon-based shared root and invokes GPRU in its atomic action, the circuit compiles, and a production Groth16 setup produces the verifying key installed by Mother authority. Do not use an insecure test setup for Devnet or production. No proving key or setup artifact belongs in Git.

## Build inputs

The circuit imports `circomlib/circuits/poseidon.circom` and `circomlib/circuits/bitify.circom`. Compile it with a pinned Circom 2 compiler and a pinned `circomlib` release; record both versions and the source digest in the setup transcript before generating a production key. The verifying key's circuit identifier must match GPRU's `circuit_commitment_v1()`.

The TIP root account and TCAP root field layouts are protocol contracts. TIP's shared root account contains version, bump, a 32-byte Poseidon root, leaf count, and a 32-level append frontier. Its serialized account data is 1,066 bytes. Settlement proofs use the hidden leaf index and a 32-element membership path; the account is shared by every route and is not a per-TIN transaction account.
