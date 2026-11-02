# Technology and operational reference

**Status: CURRENT source roles; versions below are declared requirements or separately dated observed tooling.** A dependency declaration is not proof that its external service is deployed. Reasons for selection are documented only where implementation establishes the required role; undocumented historical alternatives remain unknown.

## Rust, Solana and Anchor

Rust implements TIP, TSNP, TCAP and GPRU. Solana account ownership, signer enforcement, PDAs, CPIs and transaction rollback supply the program execution boundary. Anchor supplies account constraints, serialization and instruction dispatch in TSNP/TCAP/GPRU; TIP's source uses its own instruction enum/processor and state serialization. Program IDs remain the configured existing IDs.

The program Anchor configurations pin CLI `0.30.1`. The November 2 successful SBF builds used Solana `cargo-build-sbf 1.18.26`, platform-tools `v1.41` and its Rust `1.75.0`. These are observed build tools, not a universal host Rust requirement. The TSN SDK separately declares JavaScript `@coral-xyz/anchor ^0.32.1`; that dependency range is not the CLI pin. A current build does not regenerate every IDL automatically.

The [root deployment wrapper](../../scripts/devnet-program-deploy.mjs) reads configured Anchor cluster/wallet settings, builds programs and manages deployment transport/recovery. `programs:devnet:deploy:all` runs TIP then TSNP/TCAP/GPRU deployment. The public source names do not change IDs. [Devnet build/deploy](../DEVNET-BUILD-DEPLOY.md) remains the canonical operator procedure; commands that deploy or sign require explicit operator action.

## TypeScript, JavaScript and Node.js

TypeScript implements SDK contracts, Receiver, Cranker and application code; JavaScript ESM scripts supply tooling and tests. The inspected Windows Node runtime is `22.14.0`. The SDK declares TypeScript `^6.0.3`; Receiver declares `^5.8.3`, and package-lock files capture installed resolution separately from these ranges. No single repository-wide Node engine policy is declared by the SDK package.

The SDK requires standards-based fetch, WebCrypto and binary/Solana types where the selected module uses them. Its `private: true` package cannot be assumed installable from public npm. Browser use needs the existing browser bundling path and safe module selection; the root exports server facilities too. Receiver's test command uses Node's experimental TypeScript stripping, so a runtime capable of that flag is necessary for that command.

## Python verification service

FastAPI, Uvicorn, HTTPX, Firebase Admin, python-dotenv, PyNaCl and cryptography are declared in the [Node requirements](../../tsn-protocol/services/tsn-node/requirements.txt). FastAPI defines validated HTTP models; HTTPX performs Receiver/RPC calls; PyNaCl supports Ed25519 and Secretbox/curve-related operations used in service payload boundaries. The cryptography package supplies other keyed operations used by source. Declared Python requirements are lower bounds, not pinned production reproducibility guarantees.

Node's hidden-head adapter launches a Node subprocess for `snarkjs` operations rather than reimplementing Groth16 in Python. The witness store uses JSON snapshots with root-selected filenames and structural/root checks. Local persistence does not establish cross-operator consensus or a complete history indexer.

## Cryptographic libraries and circuit tools

The SDK declares `@noble/curves ^1.9.7`, `@noble/hashes ^1.8.0`, `tweetnacl ^1.0.3`, Solana web3/SPL-token dependencies and additional privacy helpers. Their actual selected functions are visible in [cryptography sources](cryptography.md). AES-GCM protects identity envelopes; Secretbox protects owner record content; BabyJubjub operations support Pedersen transitions and the proof-bound one-time delta ciphertext. SHA-256 and Poseidon serve different commitment/serialization roles.

The circuit package declares `circom2 0.2.19`, `circomlib 2.0.5` and `snarkjs 0.7.6`. Groth16 uses circuit-specific R1CS/WASM and proving/verifying keys. On-chain `groth16-solana` validates encoded proofs. The development setup is a testing artifact; its successful verification does not replace a production ceremony or independent cryptographic audit.

## Storage, ingress and messaging

Receiver uses Firebase Admin `^13.4.0` and Next `^15.5.21` with React `^19.1.1` in its manifest. Firestore transactions control durable idempotency, lease/version updates and the relation between funding and settlement work. The [local Firestore implementation](../../tsn-protocol/services/tsn-receiver/lib/local-firestore.ts) supports controlled local development; it is not evidence of identical durability or multi-process scaling.

Node/Cranker wake notifications carry coordination signals rather than private work payloads; authenticated workers re-read leased work. Receiver's encrypted Node envelope reduces durable plaintext exposure but does not conceal plaintext at initial ingress. Service keys, wallet challenge/session authorization and signed Node decisions serve separate purposes.

## RPC, transaction transport and monitoring

The RPC gateway selects configured Solana HTTP/WebSocket upstreams, implements provider timeouts and origin policy, and exposes transport health. SDK health probes use HTTP results and Solana `getHealth`; they do not test every verifier/asset/account precondition. Operator-facing explorer/evidence tools must reconcile signatures with account state and avoid logging credentials or private witness material.

DBrix packages in the SDK/Cranker transport encode large Solana V1 transactions and Memo data. Their presence does not justify dropping signature checks or inflating transport limits. The native owner deposit and Mother-co-signed proof settlement have different signers and construction rules. Funding blockhash recovery must preserve the owner's exact bytes.

## External integrations and research

The SDK includes `lit` web components and separately pinned `@lit-protocol/* 7.4.0` packages. Lit UI lifecycle behavior and Lit Protocol threshold authorization are different roles. A configured provider/action and its test evidence are needed before claiming threshold execution is available. The cross-chain tree contains EVM Solidity contracts, ethers-based adapters and Attestcoin/CCTP integration material; each route requires its own deployed addresses, liquidity, authorization and destination evidence.

## Test and documentation tooling

Node's built-in test runner covers SDK/Receiver JavaScript tests; Python unittest covers Node checks. Rust/program integration tests have chain/environment requirements and cannot be described as offline unit results. Mintlify renders the existing public MDX site and supports fenced Mermaid diagrams. The internal Python/TypeScript documentation generators run offline and create only documentation catalogs. The only inspected protocol CI workflow triggers Mintlify automation; source/API/link correctness checks must be run separately or later integrated through a reviewed workflow.

All versions and commands should be refreshed with the package manifests, lockfiles and active build logs when changing environments. Avoid copying API-key-bearing RPC URLs or local key paths into public guides.
