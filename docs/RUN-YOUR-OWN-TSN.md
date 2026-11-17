# Build and operate your own TSN

**Status: EXPERIMENTAL first-release v1 procedure, naming reviewed 2026-11-14.** The current source removes sealed funding pools and two-depositor release scheduling. The [November 8 record](laboratory/experiments/EXP-20261108-remove-funding-pools.md) separates offline checks from unperformed program deployment, in-place funding-root migration and live payment/accounting. November 7 key/deposit/pool observations and November 5 amount-public receipts remain historical evidence for their own contracts.

**Publication scope: INTERNAL development guide.** Keep this procedure in docs/ while TSN is under construction. Community documentation and the tsn-protocol subtree must not publish or promote this guide until the user explicitly requests its release.

## 1. Choose the deployment you intend to operate

The framework consists of TIP identity registration, TSNP authorization, TCAP reserve/shared-state accounting, GPRU proof verification, Receiver coordination, Node verification/proving, Cranker execution and SDK/application code. The [architecture map](laboratory/architecture-map.md) and [credit ABI](laboratory/credit-abi.md) define their contracts. A team can build these components from source; the repository's [MIT license](../LICENSE) requires retaining its copyright and license notice. Review the separate licenses of dependencies before redistributing them.

Running your own Receiver, Node, Cranker and app against the existing TrustLink Devnet IDs uses the existing chain state and governed authorities. It does not create an independent settlement network or grant control of Mother/governance keys. Creating a separate deployment requires changing program bindings, deploying new programs and initializing new state under your team's authorities. The supplied helpers are Devnet-specific and several bind fixed TrustLink IDs; changing one `.env` variable is insufficient.

The reference IDs are:

```text
TIP   TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
TSNP  TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
TCAP  tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF
GPRU  6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR
```

For a separate deployment, establish a manifest containing cluster/genesis hash, all four new program public keys, upgrade authorities, Mother authority, TCAP governance/registry authorities, service URLs, asset registrations and artifact hashes. Keep private keypairs outside published records. Reconcile each ID in Rust declarations/CPI constraints, `Anchor.toml`, SDK defaults/account derivations, Node/Receiver/Cranker configuration, setup scripts and application bundles. In particular, inspect `scripts/hidden-head-setup.mjs`, `scripts/network/common.mjs`, TCAP's `scripts/devnet-initialize.mjs`, the deploy wrappers and SDK `contracts.ts`/`tcap-gpru-credit.ts`. Existing ID-update helpers cover only parts of this work; review their changes rather than treating them as a complete network reconfiguration tool.

The remaining commands describe the reference Devnet layout. Apply them to new IDs only after those bindings are changed and tested. Preserve existing keys and settled state when upgrading the reference deployment; fresh-network initialization is a different operation.

## 2. Prepare the checkout and tools

Obtain a reviewed copy from the approved project sources and inspect actual Git boundaries. The [repository security controls](REPOSITORY-SECURITY.md) disable automatic Git imports/writes, third-repository submodule updates and install lifecycle scripts. On a new copy, review and apply `node scripts/repo-security.mjs harden`, then run `npm run security:check`; Git settings are checkout-local and do not appear automatically after cloning. Use separate Windows and WSL native dependency installations. Do not reuse a Linux native library in Windows Python.

Use a recent Node runtime supporting `--env-file-if-exists` and the Receiver's type-stripping test command; Node 18 as declared by the root package is not a sufficient description of every service command. Install Python and create a virtual environment. Install Rust/Cargo on the host that runs Python, plus the Solana/SBF and Anchor toolchains in the supported WSL deployment environment. The supplied operator deployment detected Rust 1.94.0, Solana/SBF 1.18.26 and Anchor 0.30.1; this is bounded evidence, not a compatibility promise for arbitrary versions.

From the repository root in PowerShell, install the local package dependencies in order:

```powershell
npm ci --ignore-scripts
npm --prefix tsn-protocol/programs/tcap-protocol/tcap-sdk ci --ignore-scripts
npm --prefix tsn-protocol/sdks/tsn-sdk ci --ignore-scripts
npm run tsn:sdk:build
npm --prefix tsn-protocol/sdks/tsn-cranker-sdk ci --ignore-scripts
npm run tsn:cranker-sdk:build
npm --prefix tsn-protocol/services/tsn-receiver ci --ignore-scripts
npm --prefix tsn-protocol/services/tsn-rpc-gateway ci --ignore-scripts
npm --prefix tsn-protocol/services/tsn-cranker-op-daemon ci --ignore-scripts
python -m venv .venv
```

Use `npm install --ignore-scripts` only after an intentional manifest/lockfile change or for a genuinely unlocked package. All dependency-bearing source roots now have locks, including TCAP SDK's TypeScript 6.0.3. The policies suppress dependency lifecycle and automatic npm pre/post scripts; named scripts still execute. Frontend/backend `prebuild` must be reviewed and explicitly invoked when building those apps. Native tools such as esbuild or sharp may need an individually reviewed package-specific rebuild in isolation; never disable the policy globally to make a build pass. A missing compiler launcher or local dependency must be repaired before proceeding; do not treat stale `dist` as a successful build. The SDK clears its generated `dist` and forces compilation; rebuild its browser bundle with `npm run tsn:sdk:browser:build`. Clean-machine installation/build under these defaults remains unverified.

Python setup is incomplete as a secure fresh-install workflow: `requirements.txt` uses minimum-version ranges and has no complete reviewed pins/hashes lock. Automatic mempool, Windows setup and WSL migration helpers now fail before installation/copying. Preserve current environments; resolve and review platform-specific wheels and their complete transitive hashes in isolation before installing new Python dependencies. Direct pip commands and the existing Docker build remain outside those guards. No new Python lock or verified clean install is claimed. The [November 16 record](references/REPO-SECURITY-20261116.md) separates applied controls from these missing checks.

PowerShell uses backticks for multiline commands, Windows paths and `Set-Location`. WSL Bash uses backslashes, `/mnt/c/...` paths and `cd`. Do not paste PowerShell syntax into a prompt such as `bigdream@...:$`.

## 3. Provision authority and service keys

Create dedicated keypairs for program deployment, TCAP governance, Mother authority and each Cranker operator. Fund the required Devnet fee/rent payers. The owner wallet pays its TCAP funding transaction; Cranker pays the later settlement transaction. A Cranker reserve vault is part of a distinct liquidity capability and is not the source of this sender-funded native deposit.

Provision the following service material in private `.env` files or the deployment secret manager:

- Node and Receiver share `TSN_RECEIVER_NODE_API_KEY` for authenticated work/state/wake operations.
- Node holds `TSN_NODE_VERIFICATION_SIGNING_KEY`, a dedicated Ed25519 seed. Receiver and Cranker hold only its matching `TSN_NODE_VERIFICATION_PUBLIC_KEY`.
- Receiver holds `TSN_RECEIVER_NODE_PAYLOAD_KEY` for restricted encrypted ingress storage. Its authenticated Node work endpoint releases the permitted private payload to Node.
- Node holds the stable `TINS_LOOKUP_SECRET`, threshold nonce signer, settlement authorization signer and any route-attestation signer required by the chosen identity/route APIs. Changing lookup material can prevent resolving existing TINs; key rotation requires reviewing the corresponding verifier pins and data contract.
- Node holds `TSN_MOTHER_AUTHORITY_KEYPAIR_PATH`, pointing to the Solana keypair matching on-chain Mother authority. This is separate from its verification seed. Cranker holds its own `KEYPAIR_PATH`/`TSN_CRANKER_KEYPAIR_PATH` and no Mother key.

Generate keys on the operator machine, store private values directly in protected configuration and distribute public pins to their verifiers. [Node key provisioning](TSN-NODE-KEYS.md) and the service `.env.example` files provide formats; check the active handler before enabling settings for retained epoch or cross-chain features. `npm run tsn:node:keys` writes threshold/route-attestation keys into Node `.env` only when both are unconfigured; it does not provision every key listed above.

## 4. Build and deploy the four programs

Use WSL Bash for the root deployment scripts. Review each program's `Anchor.toml`, existing `target/deploy/*-keypair.json`, RPC and authorized upgrade wallet. For a new deployment, generate your team's program keypairs and reconcile their public IDs with source before compiling. Do not replace the reference deployment's keypairs.

```bash
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
export TRUSTLINK_DEPLOY_RPC_URL="$ANCHOR_PROVIDER_URL"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
export SOLANA_WALLET="$ANCHOR_WALLET"
npm run deploy:doctor
npm run programs:devnet:deploy:all
```

`programs:devnet:deploy:all` builds/deploys TIP first, then TSNP, TCAP and GPRU. `programs:devnet:deploy` covers the latter three only. The supported SBF build uses `anchor build --no-idl`; a host IDL-generation failure does not establish a bad SBF binary. See [deployment mechanics and recovery](DEVNET-BUILD-DEPLOY.md) for individual commands, buffer recovery and transport settings.

For the TSNP/TCAP/GPRU wrapper, `TRUSTLINK_DEPLOY_RPC_URL` explicitly selects the RPC; without it, the workspace `Anchor.toml` cluster retains priority over generic shell RPC variables. Before buffer creation or writes, the wrapper verifies Devnet genesis and capacity, retries temporary RPC read failures three times, and checks public Devnet if the selected provider remains unavailable. `TRUSTLINK_DEPLOY_RPC_FALLBACK_URL` selects another Devnet backup or `none` to disable it; `TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS` accepts 1–5. The chosen endpoint remains fixed through extension, upload and post-deploy inspection. These settings do not change TIP, initialization or service RPC configuration.

After each deploy, inspect Program ID, loader owner, ProgramData, upgrade authority, deployment slot and data capacity. Preserve source/build hashes and compare deployed bytes where possible. A slot change alone is weaker evidence than a binary comparison, and neither initializes protocol accounts or proves a payment. Reconcile uncertain CLI results before repeating an upgrade.

## 5. Initialize TIP, Mother and TCAP

These steps submit transactions. The deployment owner performs them with the intended authorities after verifying program IDs and cluster. Do not run them as ordinary service startup commands.

Initialize TIP's global state once, from a configured WSL prompt:

```bash
npm run tin:init-global -- "$TINS_PROGRAM_ID" "$SOLANA_WALLET" 100000000
```

Set `TINS_PROGRAM_ID` to the manifest value first. The helper derives `global-state`, uses instruction tag 0 and returns without sending if the account exists. Inspect an existing account's owner/version separately; presence alone is not a migration. Current program initialization creates global version 3. The append-only TIP route root is created during the first valid direct/staged TIN registration, not by an invented separate root-init command.

Initialize Mother Escrow with the Mother authority keypair. The operator wrapper reads its package `.env` and `.env.local`; its `KEYPAIR_PATH` selects the signer even for `mother:init`. Configure it deliberately for this one-time step, then restore the Cranker operator key before registration. The CLI currently uses `sha256("tsn-dev-seed")`, seven-hour epochs and a 30-second lease default; independent deployments requiring different values must change the inspected CLI/SDK inputs rather than invent environment overrides.

```bash
npm run tsn:mother:init
npm run tcap:init:devnet
```

TCAP initialization creates global config, asset registry and commitment root under the configured payer/governance and TSNP binding. Its helper gives the `Anchor.toml` RPC priority over shell RPC values. On a freshly missing root, it creates the zero/paused root; use the separate activation step below to install the canonical empty state. On an existing sequence-zero zero root, the helper can activate it. It refuses to silently unpause established state. Mother/config layout migration commands apply only to an inspected old layout, not every new installation.

Register a supported asset after TCAP exists. For the reference six-decimal Devnet USDC profile:

```bash
npm run network:status -- --mint=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
npm run network:init-asset -- --mint=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU --governance-keypair=/path/to/governance.json
# After reviewing its simulation/plan:
npm run network:init-asset -- --mint=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU --governance-keypair=/path/to/governance.json --confirm
```

The helper registers policy, approves risk, initializes reserve/vault, activates the asset and enables deposits. It requires six decimals and uses a reference `standard-public` policy profile; it is not a universal token registration procedure. Inspect TCAP's `tcap-asset-admin.mjs` for other governed profiles. Verify mint/token program, registry entry, policy accounts, reserve authority, vault, decimals, active/approved/unpaused state and deposit permission. The sender needs that mint in an owned token account and Devnet SOL for its fee. Disabled withdrawals alone do not prohibit native credit.

## 6. Compile the circuit and provision matching prover artifacts

Generate one matching artifact set for the selected circuit and preserve it. The development setup is a single-machine ceremony and is unsuitable for production funds. A production ceremony and independent circuit/security review remain separate work.

From PowerShell at the root:

```powershell
npm run gpru:circuit:install
New-Item -ItemType Directory -Force tsn-protocol/programs/gpru/circuits/hidden_head_v1/build/hidden_head_v1
npm run gpru:circuit:compile
npm run gpru:circuit:info
npm run gpru:prover:setup:dev
npm run gpru:prover:export:dev
```

Default outputs are `build/hidden_head_v1/main.r1cs`, `main_js/main.wasm`, and `dev/hidden_head_dev_only.zkey`, `verification_key.json`, `dev-setup.json`, `verifier-init-args.json`. The scripts pin circom2 0.2.19, circomlib 2.0.5 and snarkjs 0.7.6. Setup verifies Powers of Tau and the zkey against the R1CS, exports the VK and records hashes. It refuses to overwrite an existing development setup. Do not regenerate a key simply to retry an interrupted verifier upload.

Copy the matching runtime artifacts into a stable protected location outside Temp if needed. Preserve the metadata, source/hash agreement and relative directory structure. Changing a WASM/zkey/VK file independently invalidates the set. The private-amount replacement keeps thirteen inputs but changes the circuit, so earlier thirteen-input keys are also incompatible. The current VK has thirteen public inputs and fourteen IC points; old twelve-input artifacts cannot prove the funded-note statement. See [artifact contracts](GROTH16-PROVER-AND-KEY-ARTIFACTS.md).

Build the native cryptography library in the environment that runs Node Python. For Windows PowerShell:

```powershell
cargo build --locked --release `
  --manifest-path tsn-protocol/programs/gpru/Cargo.toml `
  --target-dir tsn-protocol/programs/gpru/target/node-native-funded-note
```

This produces `release/tsn_gpru_proof_contract.dll`. Linux Python requires `libtsn_gpru_proof_contract.so`; macOS requires the `.dylib`. The SBF deployment `.so` is a different build target. The funded-leaf calculation needs Poseidon arity four, and the current adapter supports arities one through five. Anchor host-build warnings are distinct from a failed compilation; require the final release result and a native smoke test.

## 7. Initialize the funding root and enroll the verifier

First inspect the actual state:

```bash
node scripts/hidden-head-setup.mjs status --rpc https://api.devnet.solana.com
```

TCAP governance initializes the new global funded-note root once. Mother authority initializes a missing V2 verifier or explicitly migrates an existing V1 verifier. Review the plan without `--send` first; append `--send` only when executing the reviewed operation:

```bash
node scripts/hidden-head-setup.mjs init-funding-root --rpc https://api.devnet.solana.com --wallet /path/to/governance.json
node scripts/hidden-head-setup.mjs init-verifier --rpc https://api.devnet.solana.com --wallet /path/to/mother.json --args /path/to/dev/verifier-init-args.json
```

For an existing V1 verifier, use `migrate-verifier` to reallocate the same PDA from 1,388 to 1,452 bytes. For an existing V2 verifier carrying the old amount-public circuit, use explicit `rekey-verifier` with the new matching initializer arguments. Both disable, upload fourteen points and enable the exact key; a matching disabled upload can resume. Preserve existing TCAP roots, balances and nullifiers. These operations require Mother authority and matching upgraded programs; version numbers alone do not prove key compatibility.

Activate a fresh TCAP state root only when it is paused at sequence zero:

```bash
node scripts/hidden-head-setup.mjs activate-root --rpc https://api.devnet.solana.com --wallet /path/to/governance.json
```

Review then execute with `--send`. Preserve a nonzero sequence root and its nullifier history; initialization is not a repair for missing snapshots or failed credits. After activation, verify nonzero state/funding roots, pause flags, verifier V2/enabled state and exact circuit/VK commitments. Separate legacy config `proofVerifierEnabled` fields are not the hidden-head verifier used by the current credit handler; inspect that handler before changing them.

### Separate epoch artifacts and verifier

The epoch circuit uses the same pinned tool installation but a separate five-input key. From the root in PowerShell:

```powershell
npm run gpru:epoch:circuit:compile
npm run gpru:epoch:prover:setup:dev
node scripts/tcap-epoch-setup.mjs status --rpc https://api.devnet.solana.com
node scripts/tcap-epoch-setup.mjs init --rpc https://api.devnet.solana.com --wallet C:/path/to/mother.json --args C:/path/to/tcap_epoch_v1/build/tcap_epoch_v1/dev/verifier-init-args.json
```

Replace paths with the retained matching set. Setup defaults to `circuits/tcap_epoch_v1/build/tcap_epoch_v1` and `dev/tcap_epoch_dev_only.zkey`. It verifies Ptau/zkey and exports six IC points; an existing prepared development Ptau may be selected with `GPRU_EPOCH_PTAU_FINAL_PATH`. The initializer is read-only unless `--send` is supplied, accepts matching disabled-upload resume, and requires explicit `rekey` for a mismatched existing key. The epoch verifier is a new 940-byte PDA at `[gpru:tcap-epoch-verifier:v1]`. The credit epoch is created by normal Mother-authorized credit. The existing global funding account uses the version-2 retained-root layout; an older version-1 account requires its separate governance-authorized in-place migration. There is no pool initialization or capture work. Credit epoch uses reserve accounting_epoch in the existing 201-byte layout.

### Existing reference Devnet activation: November 7 local preparation

The operator reported successful program deployments and the Windows native release build. Independent deployed-binary comparison remains unverified. Local preparation retained the previously validated matching credit and epoch sets in `protocol-test-runs/private-credit-20261107/credit` and `epoch`, verified all five source/runtime artifact hashes per set and the initializer-to-runtime VK encoding/commitments, and checked the Windows DLL against the Poseidon reference vector and arities 1–5. Node's `.env` now contains both six-field artifact sets and its native-library path; only those thirteen overrides were removed from `.env.local`. Unrelated configuration and the existing witness-directory setting were verified unchanged against private backups. This checkout-specific preparation is not a portable installation result.

Read-only Devnet checks at slots 519695668–519695833 found the existing enabled V2 credit verifier carrying a different key and no epoch verifier. The TCAP state root was active at sequence 5, with funding leaf count 1. The reviewed operations are six credit-rekey transactions and four epoch-initialization transactions, all within the standard 1232-byte packet limit. No activation transaction was signed or submitted by the assistant.

From the repository root in **Windows PowerShell**, the operator can execute these one-time operations with the retained matching artifacts and existing Mother keypair:

```powershell
node scripts/hidden-head-setup.mjs rekey-verifier --rpc https://api.devnet.solana.com --wallet tsn-protocol/services/tsn-node/keys/mother-node-keypair.json --args protocol-test-runs/private-credit-20261107/credit/dev/verifier-init-args.json --send
node scripts/tcap-epoch-setup.mjs init --rpc https://api.devnet.solana.com --wallet tsn-protocol/services/tsn-node/keys/mother-node-keypair.json --args protocol-test-runs/private-credit-20261107/epoch/dev/verifier-init-args.json --send
```

Require the first command's exact-key/fourteen-IC confirmation before proceeding to the second, then require its enabled/six-IC confirmation. Verify both exact key sets without sending:

```powershell
node scripts/hidden-head-setup.mjs init-verifier --rpc https://api.devnet.solana.com --args protocol-test-runs/private-credit-20261107/credit/dev/verifier-init-args.json
node scripts/tcap-epoch-setup.mjs init --rpc https://api.devnet.solana.com --args protocol-test-runs/private-credit-20261107/epoch/dev/verifier-init-args.json
```

Both checks should report an already-matching verifier with no transactions needed. An interrupted matching disabled upload can resume through these commands with the Mother wallet and `--send`; do not rerun `rekey-verifier` merely to resume. Preserve existing roots, nullifiers and witness state. Reload Node from a fresh PowerShell terminal only after both verifier checks succeed; inherited old artifact variables take precedence over `.env`. Live activation, multiwallet credit and complete epoch accounting remain unverified until the corresponding receipts and accounting are inspected.

## 8. Persist Node artifact settings and witness state

Place the following in `tsn-protocol/services/tsn-node/.env`, using absolute paths for that machine. This example assumes the default artifact directory; a retained matching artifact set may use a different stable directory.

```dotenv
GPRU_CIRCUIT_BUILD_DIR=C:/your-checkout/tsn-protocol/programs/gpru/circuits/hidden_head_v1/build/hidden_head_v1
GPRU_CIRCUIT_WASM_PATH=C:/your-checkout/tsn-protocol/programs/gpru/circuits/hidden_head_v1/build/hidden_head_v1/main_js/main.wasm
GPRU_PROVING_KEY_PATH=C:/your-checkout/tsn-protocol/programs/gpru/circuits/hidden_head_v1/build/hidden_head_v1/dev/hidden_head_dev_only.zkey
GPRU_VERIFICATION_KEY_PATH=C:/your-checkout/tsn-protocol/programs/gpru/circuits/hidden_head_v1/build/hidden_head_v1/dev/verification_key.json
GPRU_PROVER_METADATA_PATH=C:/your-checkout/tsn-protocol/programs/gpru/circuits/hidden_head_v1/build/hidden_head_v1/dev/dev-setup.json
GPRU_PROVER_METADATA_SHA256=<SHA256-of-your-exact-dev-setup.json>
GPRU_EPOCH_CIRCUIT_BUILD_DIR=C:/your-checkout/tsn-protocol/programs/gpru/circuits/tcap_epoch_v1/build/tcap_epoch_v1
GPRU_EPOCH_CIRCUIT_WASM_PATH=C:/your-checkout/tsn-protocol/programs/gpru/circuits/tcap_epoch_v1/build/tcap_epoch_v1/main_js/main.wasm
GPRU_EPOCH_PROVING_KEY_PATH=C:/your-checkout/tsn-protocol/programs/gpru/circuits/tcap_epoch_v1/build/tcap_epoch_v1/dev/tcap_epoch_dev_only.zkey
GPRU_EPOCH_VERIFICATION_KEY_PATH=C:/your-checkout/tsn-protocol/programs/gpru/circuits/tcap_epoch_v1/build/tcap_epoch_v1/dev/verification_key.json
GPRU_EPOCH_PROVER_METADATA_PATH=C:/your-checkout/tsn-protocol/programs/gpru/circuits/tcap_epoch_v1/build/tcap_epoch_v1/dev/dev-setup.json
GPRU_EPOCH_PROVER_METADATA_SHA256=<SHA256-of-your-exact-epoch-dev-setup.json>
GPRU_NATIVE_LIBRARY_PATH=C:/your-checkout/tsn-protocol/programs/gpru/target/node-native-funded-note/release/tsn_gpru_proof_contract.dll
GPRU_HIDDEN_HEAD_WITNESS_DIR=C:/your-checkout/private-state/hidden-head-witness
```

Calculate the metadata pin with `Get-FileHash -Algorithm SHA256 <metadata-path>` in PowerShell. Node loads inherited process variables first, then `.env.local`, then `.env`, without overriding existing values. Remove duplicate artifact overrides from `.env.local` and earlier terminal settings if `.env` is intended to be authoritative. Start a fresh terminal/process after changes; editing `.env` does not reload a running service.

Persist and protect the complete witness directory, including `credit-openings/<amountCommitment>.json`. The amount/blinding/token/nullifier journal is required for aggregate proving; public history cannot recover lost private openings. Keep it out of Git, logs and public/Cranker responses. TIP/funding snapshots can be reconstructed within 10,000-leaf/signature bounds. Established head/nullifier state needs its matching candidate snapshot; never substitute empty state. Back up restricted Receiver note envelopes and openings under the same access controls.

For a truly fresh activated TCAP root, create its empty snapshot only after verifying sequence zero and the canonical empty root. Run this PowerShell example from the Node service directory; it performs reads and creates one local file, with no signed transaction:

```powershell
@'
import asyncio, json, os
from pathlib import Path
import server
from hidden_head_witness import SparseTree
from gpru_crypto import poseidon_v1

async def initialize_empty_snapshot():
    _, root, sequence = await server._read_tcap_shared_replay_root()
    empty_tree = SparseTree(128, {}).root
    expected = poseidon_v1([empty_tree, empty_tree]).to_bytes(32, "big")
    if sequence != 0 or root != expected:
        raise RuntimeError("Existing TCAP state requires its matching snapshot; refusing empty bootstrap")
    directory = Path(os.environ["GPRU_HIDDEN_HEAD_WITNESS_DIR"])
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / ("tcap-" + root.hex() + ".json")
    with target.open("x", encoding="utf-8") as stream:
        json.dump({"version": 1, "heads": {}, "nullifiers": []}, stream)
    print("Created matching empty TCAP snapshot")

asyncio.run(initialize_empty_snapshot())
'@ | ..\..\..\.venv\Scripts\python.exe -
```

If the file already exists, inspect/validate it; do not overwrite it. Back up matching established snapshots, restricted Receiver storage and metadata under the deployment's access policy. Candidate snapshots alone do not advance on-chain state. Losing the private note envelope after a confirmed deposit can prevent settlement recovery even when public funding leaves remain available.

## 9. Configure services for one consistent deployment

Create each service's private environment from its `.env.example` without overwriting existing configuration. Configure explicit URLs for your deployment rather than relying on hosted TrustLink fallbacks. Example local addresses are gateway `http://127.0.0.1:8787`, Receiver `http://127.0.0.1:8010` and Node `http://127.0.0.1:8000`.

For the gateway, set `TSN_SOLANA_RPC_UPSTREAM_URLS` to reliable Devnet providers. The default adds public Devnet as a bounded fallback. Keep every provider on the same genesis hash; mainnet/localnet providers are not substitutes. `TSN_RPC_PROVIDER_TIMEOUT_MS` applies per provider. Provider health/ranking is learned on demand by default; a health response does not test every RPC method or establish blockhash visibility. Provider keys remain server-only.

For Receiver, configure `TSN_RPC_URL`, `TSN_PROGRAM_ID`, Node public verification pin, shared work credential, encrypted payload key, `TSN_NODE_URL` and `TSN_RECEIVER_PUBLIC_URL`. Production storage uses Firebase Admin configuration; provision your own project, Firestore collections and access controls. Optional Realtime Database wakes require their own database/web-API configuration and rules. The guarded JSON adapter is for isolated local testing only: use `TSN_RECEIVER_STORE=file`, `TSN_ALLOW_LOCAL_JSON_STORE=true` and a protected `TSN_RECEIVER_LOCAL_FILE`. It is not a production fallback.

For Node, set `TSN_RECEIVER_URL` and any intended fallback to your Receiver, `TSN_RPC_URL` to the gateway, `TSN_PROGRAM_ID`, `TINS_PROGRAM_ID`, key material, host/port, artifact settings and witness directory. The current archive repository `GITHUB_REPO` is fixed in Node's [core/configuration.py](../tsn-protocol/services/tsn-node/core/configuration.py); independent deployments must review/change that binding before enabling epoch archival. Receiver owns durable work storage; enabling direct Node Firebase/local storage is a separate isolated-test capability.

For Cranker, set `TSN_RPC_URL`, `TSN_RPC_FALLBACK_URL`, `PROGRAM_ID`, `TINS_PROGRAM_ID`, operator key paths and the Node public verification pin. Configure `TSN_LOCAL_RECEIVER_URL` for local operation. Startup pins a ready local Receiver; hosted selection requires explicit `TSN_ALLOW_HOSTED_RECEIVER_FALLBACK=true` and the intended `TSN_RECEIVER_URL`. Startup checks RPC version and Mother before leasing. Cranker admission uses the registered on-chain identity and signed challenge/session requests, not a shared Cranker API key.

Register each operator once after Mother exists, with the operator's own key selected:

```powershell
npm run tsn:cranker:register
```

Verify Mother/Cranker PDAs and operator public key. Setup writes private per-operator `operator-state.json`; it is not Node's state database. See [Cranker operator procedures](CRANKER-OPERATOR-GUIDE.md) and the [current daemon contract](../tsn-protocol/services/tsn-cranker-op-daemon/README.md).

## 10. Start services and build the application

The operator starts each process in a separate terminal from the root. Start the gateway and Receiver first, then Node and Cranker, so dependencies are available:

```powershell
npm run rpc:gateway:dev
npm run tsn:receiver:dev
npm run tsn:node:dev
npm run tsn:cranker:start
```

Those four lines belong in four terminals. On Linux, start Node with the Linux virtual environment's Python from its service directory; the root `tsn:node:dev` alias contains a Windows interpreter path. Production Node/Cranker require persistent workers; Receiver can run in its configured Node.js API host, and gateway hosting must preserve its HTTP/WebSocket configuration.

Build and launch the reference XP with:

```powershell
npm run protocol-tests:ui
```

This builds the SDK/browser bundle and starts XP in local mode at port 4317. Its environment can select `TSN_LOCAL_NODE_URL`, `TSN_LOCAL_RECEIVER_URL` and local gateway configuration. For your own app, install/build the workspace SDK through its `file:` dependency and use the existing [SDK setup](../tsn-protocol/tsn-docs/sdk/getting-started.mdx), [typed examples](../tsn-protocol/tsn-docs/sdk/examples/) and [payment guide](../tsn-protocol/tsn-docs/sdk/payment-guide.mdx). The SDK is currently a private workspace package; a public npm release is not established by its name.

The full TrustLink Pay frontend/backend and mempool UI are optional application surfaces, separate from the minimum credit stack. Install their dependencies and database configuration before using `frontend:dev`, `backend:dev` or `tsn:mempool-ui:dev`. A TSN deployment does not automatically provision those applications' user records, notifications or external integrations.

## 11. Verify identity, funding, settlement and recovery separately

First check gateway RPC version/genesis, Receiver `/api/health`, Node `/network/recent-blockhash`, asset/reserve accounts and verifier status. Create or recover an owner-authorized private TIN through the current SDK/XP; verify its TIP record and finalized creation result. Direct and staged creation remain supported. Owner recovery authorization and Node resolution are different checks.

Use one genuine positive funded note and persistent protected amount openings to verify single-deposit credit eligibility. Require exact confirmed wallet-signed funding, authenticated current/retained funded membership, the thirteen-input private-amount proof, lease-bound Mother authorization, confirmed credit and owner commitment-opening/history recovery. Individual credit must leave reserve assets/liabilities unchanged. Then require a complete 2–64-credit epoch proof, one authenticated pending-to-settled reclassification, preserved backing and no duplicate accounting. A singleton epoch carries forward without delaying individual credit eligibility. Public singleton funding history can remain source-linkable.

Retain sanitized work IDs, version/lease metadata, transaction signatures, program/source/artifact hashes and resulting public state. `RECEIVED` settlement means coordination exists; it does not mean credit executed. Source compilation, program deployment, Node proof validation, chain confirmation and owner recovery must each have their own evidence.

Test altered amount/asset/note/opening, replayed nullifier, stale roots/lease, invalid proof and mismatched Memo at their enforcing boundary. Source removes signature-nullifier and unblinded amount-guessing formulas. Deposit amounts, epoch total, token, roots, points, ciphertext, accounts and timing can still permit inference; Node knows openings/routes and recipient/head correlation remains separate. A successful flow supplies no worldwide comparative privacy evidence.

The [November 5 public-only check](laboratory/experiments/EXP-20261103-funded-note-credit.md#public-only-deposit-to-credit-regression-2026-11-05) verifies the new nullifier differs from the former signature-derived formula but still links the reference pair through a funding tree containing only one deposit. A successful single-deposit credit tests execution, not an anonymity set. The read-only `scripts/check-funded-note-public-link.mjs` records public formula, receipt and singleton-root evidence; use a fresh output path when repeating the documented command. Larger-set privacy testing must account for public token/amount, selected-root membership and prior spend knowledge.

## 12. Diagnose failures without repeating uncertain payments

**Exactly-one-deposit rejection.** The error `Wallet funding transaction must contain exactly one TCAP reserve deposit` can come from the former Node check counting every instruction rather than deposit instructions. The observed signed request contained one canonical `deposit_private_funding_v1` plus wallet-added compute-limit and priority-price instructions. The corrected SDK/XP and Node permit one exact approved funded-note deposit with well-formed, nonduplicate ComputeBudget instructions; they reject additional transfers, TCAP actions, Memo instructions and malformed settings. SDK/XP validate the returned owner-signed wire before ingress, and Node compares the complete successful RPC wire with that signed wire before settlement. Build the current SDK/browser bundle and load the corrected existing Node/XP processes. Inspect the original funding signature/status before rebuilding or authorizing another deposit; linked settlement `RECEIVED` does not establish submission or confirmation.

**Missing funding root.** `TCAP_FUNDING_ROOT_ACCOUNT_MISSING` blocks preparation before signing. Inspect the canonical global root and initialize it using governance after deployment. A retry against an old deposit ABI cannot supply funded membership.

**Blockhash not found.** A signed transaction has a finite bank/block-height lifetime. Wallet review, Node reads, queues and RPC latency consume it; another provider may also be behind the issuing bank. XP now refreshes the blockhash after amount approval and before transaction approval. The gateway tries other providers with the same simulation/send payload after `BlockhashNotFound`. Node distinguishes all explicit rejections from partial RPC unavailability and retries temporary service failures under the active lease, within its 600-second processing window. Genuine expiry still requires rebuilding and a fresh owner signature. Check the original signature/work result before another deposit; Cranker cannot refresh owner-signed bytes.

**RPC unavailable or slow.** Verify actual RPC methods, provider genesis hashes, rate limits and per-provider latency. “Network ready” is reachability, not proof that the chosen bank recognizes a transaction. Node tries its configured gateway and public Devnet; those endpoints can themselves route different backend banks. Keep secrets out of URLs printed in evidence. Persistent outages can leave work awaiting lease recovery/another authenticated wake; do not label it confirmed or bypass verification.

**Deployment RPC DNS failure before upload.** A successful SBF build followed by a failed genesis/capacity read means upload has not started. The corrected wrapper retries temporary DNS, timeout, HTTP 429 and server failures, then checks a verified Devnet backup before any write. The workspace `Anchor.toml` cluster remains the default; `TRUSTLINK_DEPLOY_RPC_URL` explicitly overrides it for this invocation. Authentication, wrong-cluster and program/account errors do not select a backup. After exhausted availability retries, inspect WSL DNS and the intended provider with read-only CLI commands; use a reliable same-cluster provider rather than assuming public Devnet is always available. The [November 15 wrapper correction](references/TSN-OPERATOR-GUIDE-20261105.md#deployment-wrapper-rpc-recovery-correction-2026-11-15) records offline validation and preserves the original DNS observation. A failed post-deploy inspection has a different meaning: the upload CLI returned success but verification is incomplete, so inspect deployed state/bytes before repeating an upgrade. Buffer recovery, deployment verification and payment recovery remain separate.

**Windows local Receiver lock access error.** The isolated JSON adapter now retries `EPERM`/`EACCES` only while opening its exclusive lock, with at most eight attempts and increasing delays totaling 1,120 ms. Access errors never trigger stale-lock deletion; existing contention handling stays separate. A transient denial can recover within that bounded window, while persistent access errors still fail and leave stored work unchanged. Load the corrected Receiver code in its existing service terminal before evaluating live recovery. A subsequent lease/confirmation must still be checked independently; an earlier `poll failed` line does not describe later work status. See [the current validation record](DOCUMENTATION_STATUS.md#tcap-credit-stack-correction-2026-11-15).

**TCAP funding-root rejection after confirmed funding.** The November 14 attempt failed TCAP's `InvalidFundingRoot` check (`6023`) despite selecting a recorded root. Its compiled account validator exceeded SBF's 4,096-byte stack frame; the corrected source heap-boxes decoded config/root/asset/reserve accounts and preserves the existing ABI and checks. Build the current TCAP source and verify the [offline compiled-program regression](references/TSN-OPERATOR-GUIDE-20261105.md#tcap-credit-account-decoding-correction-2026-11-15) before the operator deploys it. From the configured WSL repository prompt, `npm run tcap:program:build:devnet` builds and `npm run tcap:program:deploy:devnet` builds/deploys using the existing configured identity. This correction needs no account migration, root reset or proving-key change. Verify deployed-byte agreement separately; the reference upgrade at slot 522558160 was [independently matched](references/TSN-OPERATOR-GUIDE-20261105.md#corrected-tcap-deployment-verified-2026-11-15) to the tested artifact at finalized context slot 522559996. Preserve any signed failed attempt; after the corrected deployment is verified, use the existing failed-settlement resolver to inspect it before explicitly recording nonexecution. Releasing its lock can wake other eligible work; it does not requeue that failed attempt or repeat funding. A fresh proof, confirmed credit and owner recovery remain separate checks.

**Signed native submission rejected.** `phase=SEND` means broadcast did not return the expected signature; it does not establish whether chain execution occurred. Cranker now preserves numeric RPC/Solana codes, instruction index/custom program error from preflight, HTTP status or `TIMEOUT`, excluding provider messages, logs, URLs and signed bodies. Reload Cranker to use these diagnostics. An older `RPC_OR_TRANSPORT_ERROR` record cannot recover the discarded provider response. Reconcile its exact signature; an unsigned simulation with a fresh deadline tests program acceptance separately and cannot prove the original signed attempt succeeded or explain its rejection.

**Funding confirmed, settlement incomplete.** Preserve the deposit and original restricted note. Repair matching keys/snapshots or the specific rejected condition, then use the supported authenticated settlement retry/reconciliation for that work. Root-change retries reconstruct with the same note/nullifier. A saved submission signature requires chain reconciliation. Do not make a new deposit merely because settlement is `RECEIVED`, `REJECTED` or `FAILED`.

**Settlement waiting behind an old signed failure.** Receiver holds the shared-root verification lock while a signed failed attempt is unresolved. Cranker cannot lease later settlement until Node can verify it. The guarded `POST /api/internal/node/work/resolve-failed` operation covers expired native credit whose exact authorized predecessor root and sequence remain unchanged in finalized TCAP state. It additionally requires absent transaction/history results, an invalid blockhash, a finalized height past its saved lifetime, exact stored authorization/checkpoint and confirmed funding lineage. Missing receipts alone cannot release the lock. A changed or advanced root, active authorization, RPC error or stale version leaves work unchanged.

From the repository root in Windows PowerShell, `.\.venv\Scripts\python.exe scripts/resolve-failed-settlement.py --receiver-url http://127.0.0.1:8010 --work-id FAILED_SETTLEMENT_ID --expected-version CURRENT_VERSION --signature SAVED_SIGNATURE` previews evidence after loading the corrected Receiver in its existing terminal. Replace the placeholders with the observed failed holder's ID, integer version and signature; pin the Receiver that owns those records. The utility loads Node `.env`, then `.env.local`, then process environment for its existing service credential. Add `--execute` to record nonexecution and wake dependent work. This keeps the old work `FAILED`, its signature/authorization/history and the original funding intact, and never requeues that failed attempt. Running Node/Cranker can then verify and submit other eligible work. Finalized successful receipts still use the separate receipt-reconciliation command; unsubmitted rejections use the existing retry command. See [the November 14 recovery evidence](DOCUMENTATION_STATUS.md#funding-confirmed-but-shared-root-verification-blocked-2026-11-14).

**Memo public-input count rejection.** `GPRU transaction record is missing its twelve public hidden-head inputs` came from an obsolete Node Memo-length guard rejecting the current thirteen-input proof. The corrected validator requires exactly thirteen; historical twelve-input receipt decoding remains separate. Reload Node and Receiver in their existing service terminals. For an unsubmitted REJECTED settlement with confirmed original funding, `.\.venv\Scripts\python.exe scripts/retry-settlement-snapshot.py --work-id SETTLEMENT_ID --expected-version CURRENT_VERSION` inspects the request; replace those placeholders with the observed ID/integer and add `--execute` only when requeuing. The authenticated Receiver endpoint admits this exact stored error, preserves funding/payload/rejection history and requires fresh Node verification. A different proof error or saved execution result is outside this recovery. See the [observed work and tests](references/TSN-OPERATOR-GUIDE-20261105.md#settlement-memo-validation-correction).

**Confirmed credit, `LEASE_INVALID` report.** Historically, Node authorization and co-signing could consume the Cranker’s 60-second lease before the final status report. Native hidden-head credit/epoch execution now has a bounded 180-second lease; a saved signed attempt still requires receipt reconciliation after expiry. A signed checkpoint is retained for reconciliation, and expiry must never authorize a replacement payment. The corrected authenticated CONFIRMED report validates the finalized receipt for that exact signed attempt, its reporting payer and expired lease generation, then changes only Receiver status. Cranker retries only temporary RPC/finality or report transport failures, using the identical report up to six times with a 25-second request deadline and five seconds between attempts. Remaining failure leaves the receipt pending; Cranker does not report a confirmed transaction as FAILED because its receipt write failed. Reload Receiver and Cranker to load this correction. For already FAILED records, `scripts/reconcile-settlement-receipt.py` previews the matching finalized receipt; `--execute` repairs status only. See the [dated receipt and command](references/TSN-OPERATOR-GUIDE-20261105.md#expired-cranker-confirmation-report).

**Native library or prover mismatch.** Confirm the host DLL/shared library, Poseidon arity four, metadata pin, thirteen-input VK, circuit source/WASM/R1CS/zkey hashes and on-chain fourteen-IC key. Reload the intended process from clean persistent configuration. Regenerating an unrelated key or resetting the state root is not a repair.

**Missing TCAP snapshot.** Use the sequence-zero bootstrap only for its verified empty root. Established head/nullifier state requires the exact matching snapshot/history. Keep prior snapshots and candidate files; neither TIP sync nor a fresh funding root reconstructs established TCAP state.

## Maintenance and remaining deployment gaps

This guide is the internal installation/operation entry for the experimental first release, v1. Agents must read [.agents/tsn-operator-guide-policy.md](../.agents/tsn-operator-guide-policy.md) when changing any installation, deployment, initialization, service/configuration, SDK integration or recovery method. Update the affected steps, source references and validation record in the same task.

A turnkey independent-network initializer, configurable program-ID coverage, production key ceremony, clean-machine replay, established-state disaster recovery and complete owner-workflow recovery remain unverified or incomplete. The November 5 finalized reference credit is bounded receipt evidence. The guide identifies the source obligations and available commands instead of representing those gaps as already delivered automation. Retained epoch/DNA payout/refund, debit/exit and cross-chain routes require their own initialization and verification; they are not stages of this native credit procedure.

## Shared funding roots and credit-epoch accounts

Current credit uses the canonical shared funding account, its authenticated current/recent roots and the private amount proof. Pool accounts, capture submissions, source-wallet admission counts, release calibration and the pool-recovery endpoint/CLI are retired. Receiver coordinates settlement and complete `TCAP_EPOCH_ACCOUNTING` work. Native settlement/epoch Cranker leases remain 180 seconds; the final blockhash, exact statement, current lease and durable signed checkpoint safeguards remain independent.

The first accepted credit opens a shared 136-byte account for that asset/accounting epoch; later credits reuse it. The current TSNP CPI charges its rent to Mother authority. Node queues a 2–63-credit batch after 120 slots from its first credit, or a full 64-credit batch immediately. A singleton stays open, and deposits without an accepted credit do not start this timer. Accounting marks the epoch accounted and advances its number; it does not close the account or reclaim rent. These are TCAP credit-accounting rules, separate from Node's seven-hour archive. The [ABI](laboratory/credit-abi.md#scheduling-recovery-and-activation) records the full lifecycle and the [November 16 checkpoint](laboratory/experiments/EXP-20261116-private-credit-epoch.md) verifies the reference two-credit batch. No new startup, recovery, deployment or migration command is introduced by this clarification.

The account layout is 6,209 bytes at the existing funding-root PDA, retaining the original current-root/count/frontier and adding 128 authenticated root/count records. Before operating the new runtime on an existing network, deploy matching TCAP, TSNP and GPRU program source, then perform the explicit governance-authorized funding-root migration. These are operator actions; no deployment or migration ran in this task. The credit circuit/public inputs do not change solely for pool removal, so do not regenerate or rekey matching artifacts merely for this account-authentication change.

From the repository root in Windows PowerShell, inspect the existing global account and the migration plan with the setup helper's explicit funding-root migration command. Reconcile all signed funding/settlement attempts against finalized chain history before migrating; the old pool-account runtime has no fallback after the program upgrade. Supplying the governance wallet and `--send` performs the one-time operation only after the operator has reviewed the plan. Preserve the current root/count/frontier, source IDs and witness state; do not substitute a new empty root. The [ABI](laboratory/credit-abi.md) gives exact offsets and [change record](laboratory/experiments/EXP-20261108-remove-funding-pools.md) records command validation.

Node reconstructs membership at the selected root/count and confirms it remains current or retained before publication/authorization. More than 128 newer deposited roots can retire an older proof context; unsigned work then requires fresh verification under the existing lease/version/no-checkpoint guards. The latest shared private head/nullifier state remains authoritative for replay. A signed attempt must be reconciled before replacement. Historical pool work is outside the supported dispatcher; preserve its stored signatures/history for separate inspection rather than replaying old capture recovery.

Receiver preserves domain 404 and bounded protocol rejections; signing endpoint/transport/HTTP 5xx availability failures can use the configured fallback and otherwise return a sanitized 503. Cranker maps only the exact signing-unavailable response to its current-lease unsigned retry reason. Node validates the exact unsigned native message and current lease before selecting the final confirmed blockhash; only the hash bytes may change before Mother and payer signing. Issuing context and lifetime remain checkpointed and used as minimum RPC context. No saved attempt or owner-signed deposit is refreshed by this path.

The [November 7 experiment](laboratory/experiments/EXP-20261107-private-credit-epoch.md) preserves the old pool timing, unavailable signing, store contention and expired-attempt investigations as historical evidence. Those pool commands are no longer operating procedures. Existing on-chain pool accounts remain inert historical records until separately authorized closure; removing their runtime does not reclaim rent or alter reserve custody.
