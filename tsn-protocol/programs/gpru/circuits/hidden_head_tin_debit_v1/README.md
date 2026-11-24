# TIN-Debit circuit and runtime preparation

**Status: first-release v1 implementation under verification, November 24, 2026.** TIN-Debit changes ownership of confidential value: one sender debit and one recipient credit share a proof, nullifier and atomic TCAP root update. The recipient remains offline and supplies no signature, opening or secret. Program/service implementation and offline checks do not establish deployment or a live payment.

## Canonical contract

The [machine-readable contract](../../../../contracts/tin-debit-v1.json) defines the 26 public inputs, instruction accounts, verifier layout and compact Memo offsets. TSNP authorizes TCAP, which invokes GPRU before advancing the shared root. This fee-free action has no custody transfer, reserve-category delta or credit-epoch append. Existing thirteen-input wallet-deposit credit and five-input epoch accounting remain separate.

The sender signs a Poseidon authorization binding both authenticated routes, asset, private amount/blinding/nonce, deployment and slot interval. Separate disclosure consent binds the sender's authorization, route, token, private balance/blinding and predecessor sequence/Memo. Node may rebase an unrelated global-root advance only when that exact sender head remains unchanged. It independently authenticates current routes, snapshots, governed asset, reserve solvency and enabled verifier. A changed sender head or used nullifier rejects.

The canonical host implementation lives in [Node debit components](../../../../services/tsn-node/settlement/debit/README.md). The local `offline/core.py` and `offline/sender.py` files are explicit tool facades over those components, so the circuit fixtures and runtime use the same arithmetic and consent encoding. Preparation keeps sender openings and witness values private; public execution contains only canonical accounts, proof and two encrypted Memos.

## Proof and owner records

The circuit authenticates both TIP routes and predecessor portfolios. Sender balances fit u128 with `oldBalance = newBalance + amount`; the positive amount is u64. Recipient credit adds the same amount point and an independent blinding point to its authenticated commitment. Recipient numeric balance and blinding are absent from the witness. Canonical initialization, nonresetting u64 head sequences and u64 admitted credits underpin the accumulated-balance bound; independent security review remains required.

Each Memo is `TSN_GPRU_TIN_DEBIT_MEMO_V1:` plus canonical base64url of 416 bytes, totaling 582 ASCII bytes. Its full hash enters the proof. The circuit also proves the scan-key blinding-delta ciphertext and ephemeral public point. The Secretbox amount record is checked during owner recovery; its encryption correctness is not itself proven by the circuit. Sender and recipient independently recover their own records later, verify predecessor linkage and reconstruct the successor point.

The 26 inputs are twelve scalar context/action fields followed by seven pairs: Memo commitments, successor portfolio roots, successor X, successor Y, encrypted deltas, ephemeral X and ephemeral Y. Exact order is in the contract. Root sequence is the predecessor sequence; the successful update advances it by one. Shared strict key decompositions preserve Merkle index canonicality across predecessor/successor paths.

## Offline commands

From the parent TrustLink checkout:

```powershell
npm run tsn:sdk:build
npm run gpru:tin-debit:test
node tsn-protocol/programs/gpru/circuits/hidden_head_tin_debit_v1/tools/setup-dev.mjs --ptau C:/path/to/prepared-development.ptau
npm run gpru:tin-debit:prove:dev
npm run gpru:tin-debit:roundtrip
```

Replace the Ptau placeholder with a verified prepared file of sufficient capacity. Compilation pins both sources, R1CS and WASM. Setup refuses existing keys, verifies the development ceremony and writes a separate 26-input/27-IC artifact set. Preserve previous artifacts; a stale hash or key must fail. Development artifacts are unsuitable for production funds. `GPRU_TIN_DEBIT_PYTHON` and `GPRU_NATIVE_LIBRARY_PATH` select the existing interpreter/native Poseidon library without editing service configuration.

The runtime prover uses explicit `GPRU_TIN_DEBIT_CIRCUIT_BUILD_DIR`, `GPRU_TIN_DEBIT_CIRCUIT_WASM_PATH`, `GPRU_TIN_DEBIT_PROVING_KEY_PATH`, `GPRU_TIN_DEBIT_VERIFICATION_KEY_PATH`, `GPRU_TIN_DEBIT_PROVER_METADATA_PATH` and `GPRU_TIN_DEBIT_PROVER_METADATA_SHA256`. It hashes every artifact and compares circuit/key commitments and all 27 IC points with the separate enabled chain verifier. Private witnesses travel over bounded stdin; errors omit private values.

Live execution requires matching deployed program binaries, governed verifier initialization/enrollment, configured artifacts and current snapshots. Those are operator-controlled actions. No service start/restart, deployment, chain signature or submission is performed by these offline tools.

## Public verifier export

After the matching synthetic proof passes, `node tools/export-verifier.mjs` exports `build/native-tin-debit/native-proof-fixture.bin` for the opt-in Rust verification test. The file contains only the verifier key, 26 public scalars and proof points. Supplying `--authority <Mother-public-key>` also writes an unsigned initialize/seven-IC-chunk/enable instruction plan. Replace the placeholder with the independently verified on-chain Mother authority. Export verifies artifact pins and the proof locally and performs no RPC, signing or submission. The operator must review deployed source, authority, account addresses and the development-only key before any enrollment.

An explicitly selected native Circom 2.1.9 compiler can replace the slow npm WASM-hosted compiler for this circuit only. Set `GPRU_TIN_DEBIT_CIRCOM_EXECUTABLE` and its exact `GPRU_TIN_DEBIT_CIRCOM_SHA256` in the invoking process; version and executable hash must match before execution. The build manifest records compiler provenance. The inspected official Windows release asset has SHA-256 `b31d9a9e2cddff16438423869068a9cbc428d37a328d3d1516962a23a1753b17`; it was obtained from the iden3 GitHub v2.1.9 release and has no separately published checksum in that release metadata. Existing credit tooling/configuration is unchanged.

If setup stops after creating `tin_debit_initial.zkey` and `tin_debit_dev_only.zkey`, preserve both files. Rerun the same command with `--verify-existing` only while metadata/verification-key export is incomplete. This mode revalidates Ptau, recomputes a separate disk-backed initial key, requires its hash to equal the preserved initial key, then verifies the contributed key against that exact initial key before exporting. It creates no new entropy contribution and never overwrites the preserved keys. This avoids the stock `verify r1cs` path constructing another full initial key in memory. A completed artifact set is still refused.

## Verified local checkpoint, November 24, 2026

The current source passed 24 host tests, six valid circuit witnesses and rejection of 49 mutations. Development setup verified Ptau, reproduced the initial key identically and verified its contribution before exporting 26-input/27-IC metadata. A real Groth16 proof passed snarkjs, Node serialized reverification and GPRU's Rust verifier, rejecting all 26 changed public statements. Six complete owner scenarios recovered twelve successors without recipient interaction and rejected 72 private-recovery mutations. GPRU, TCAP and TSNP SBF builds passed after the byte-compatible verifier-loading fix. These results use local development artifacts and synthetic owners/context; Devnet enrollment, deployed-byte comparison and a finalized live debit remain unverified.
