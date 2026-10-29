# GPRU hidden-head Groth16 circuit V1

`main.circom` defines the proof statement for a hidden latest-head transition. It proves that a hidden active TIP route belongs to the TIP-wide route tree, that the hidden TIN/asset leaf is the predecessor under TCAP's shared state root, that its sequence advances once with the submitted encrypted Memo commitment, and that a one-time nullifier is absent before being inserted. The updated head and nullifier subroots form the new shared TCAP root.

The eight Groth16 public inputs are ordered as follows and must match GPRU, TSN, and TCAP Rust ABIs:

1. `oldGlobalRoot` (canonical big-endian BN254 scalar)
2. `newGlobalRoot` (canonical big-endian BN254 scalar)
3. `memoCommitment` (SHA-256 of the following Memo instruction, reduced modulo the BN254 scalar modulus)
4. `actionCommitment` (canonical big-endian BN254 scalar)
5. `nullifier` (fresh canonical big-endian BN254 scalar)
6. `tipRouteRoot` (canonical big-endian BN254 scalar)
7. `successorBalanceX` (canonical big-endian BN254 scalar)
8. `successorBalanceY` (canonical big-endian BN254 scalar)

The witness hides the TIN route, TIP append index, asset leaf, predecessor memo/action commitment, per-TIN sequence, and all three sparse-tree paths. The nullifier is a fresh public random value; it must not be derived from a TIN, route key, or stable wallet address. TIP assigns route indices when TINs are created and publishes only one protocol-wide Merkle root and append frontier.

GPRU recomputes `actionCommitment` as `Poseidon(actionKind, tokenId, amount, authorizationCommitment, nullifier)`. Action kinds are versioned as credit `1`, debit `2`, and exit `3`. TCAP/TSN must provide the exact action fields bound by their authorization before calling the verifier.

## Scope and security boundary

This circuit source constrains latest-head freshness, route membership against a shared TIP root, one-time nullifier insertion, and a Pedersen balance point. Credit adds the public amount point and a fresh blinding delta without opening the predecessor balance. Debit and exit open the predecessor and successor points privately, constrain 64-bit nonnegative values, and require predecessor minus successor to equal the public amount. The circuit does not prove token custody, reserve solvency, or TCAP liquidity; TCAP must enforce those conditions and the shared-root update atomically. These constraints have not yet been compiled or independently reviewed, so they are not evidence that any action is enabled.

The GPRU verifier checks that `memoCommitment` matches the Memo instruction immediately following the top-level TSN instruction, using SHA-256-to-field reduction, and that the Memo prefix contains the successor balance point. It also validates the canonical TIP and TCAP roots and checks the public action commitment before proof verification. The verifier cannot be used until the circuit is compiled and reviewed, a production Groth16 setup is completed, generated key encodings are validated against `groth16-solana`, and Mother authority initializes the verifier account. No generated setup, proving, witness, or build artifact belongs in Git.

## Build inputs

The circuit imports `circomlib/circuits/poseidon.circom` and `circomlib/circuits/bitify.circom`. Compile it with a pinned Circom 2 compiler and a pinned `circomlib` release; record both versions and the source digest in the setup transcript before generating a production key. The verifying key's circuit identifier must match GPRU's `circuit_commitment_v1()`.

The TIP route root and TCAP shared root layouts are protocol contracts and must be checked against their current account implementations before proving. The circuit has a 32-level TIP membership path and 128-level hidden-head and nullifier paths. Those depths, hash functions, leaf encodings, field endianness, and public-input order must match the on-chain root builders and proof witness service exactly; no end-to-end compatibility has yet been verified.

For the prover, ceremony, key-conversion, and verifier-installation lifecycle, see the repository's [GPRU Groth16 prover and key artifacts guide](../../../../../docs/GROTH16-PROVER-AND-KEY-ARTIFACTS.md). The generated proving key is used off chain; the corresponding verifying key is stored in GPRU's global verifier PDA. Keep generated key material and private witnesses outside version control.

## Local development prover and keys

From the repository root, compile the circuit and generate a **single-machine development setup**:

```powershell
npm run gpru:circuit:compile
npm run gpru:prover:setup:dev
```

The setup creates a local Powers of Tau file, a circuit-specific Groth16 proving key, `verification_key.json`, and `verifier-init-args.json` under `build/hidden_head_v1/dev/`. That directory is ignored by Git. The exported initializer uses the exact big-endian G1 and `c1 || c0` G2 byte layout expected by `groth16-solana 0.0.2`; its two commitments are computed with the same domain-separated SHA-256 inputs as GPRU's Rust source.

To reuse an already prepared and independently verified phase-2 Powers of Tau file, set `GPRU_PTAU_FINAL_PATH` before `setup:dev`. The setup verifies the supplied file before circuit-specific key generation and records its filename and hash in `dev-setup.json`; it does not copy or modify the supplied file. For example, in PowerShell:

```powershell
$env:GPRU_PTAU_FINAL_PATH = "C:\path\to\powersOfTau28_hez_final_18.ptau"
npm run gpru:prover:setup:dev
Remove-Item Env:GPRU_PTAU_FINAL_PATH
```

This one-person development setup is for proving-tool and on-chain verifier integration only. It is not a production trusted setup, audit, or production verifier key. Do not initialize a production verifier from it. Production requires a publicly verifiable multi-party ceremony over the reviewed, pinned circuit build.

Given a complete private witness JSON matching every signal in `main.circom`, produce and verify a proof with:

```powershell
npm run gpru:prover:prove:dev -- path\to\private-witness.json
npm run gpru:prover:verify:dev
```

The witness provider and real TIP/TCAP sparse-map state integration are separate prerequisites. The scripts do not fabricate a witness, initialize the on-chain verifier, or enable the Node settlement path.
