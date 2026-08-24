# TCAP (Transfer Confidential Asset Protocol) Devnet credit smoke test

This smoke test uses the repository's existing Anchor/Solana wallet and
cluster conventions. It does not select or create an RPC provider. The script
reads `TCAP_RPC_URL`, `ANCHOR_PROVIDER_URL`, or `SOLANA_RPC_URL` from the
existing deployment environment and exits if none is already configured.

## Build and deploy

Deploy TSN first using its existing Anchor workspace and provider environment.
This is the program that owns the CPI authorization PDA; no new RPC URL,
wallet layout, or deployment system is introduced:

```bash
cd tsn-protocol/tsn/protocol
anchor build
anchor deploy
cd ../../../tcap-protocol
anchor build
anchor deploy
```

Then use the checked-in TCAP `Anchor.toml` and the same wallet and cluster
configuration:

```bash
cd tcap-protocol
anchor build
anchor deploy
```

Do not add a second provider URL. If the repository's deployment shell already
exports `ANCHOR_PROVIDER_URL`, reuse it for the script:

```bash
export TCAP_RPC_URL="$ANCHOR_PROVIDER_URL"
node scripts/devnet-credit-smoke.mjs
```

On PowerShell:

```powershell
Set-Location tsn-protocol/tsn/protocol
anchor build
anchor deploy
Set-Location ../../../tcap-protocol
anchor build
anchor deploy
if (-not $env:ANCHOR_PROVIDER_URL) { throw "Set ANCHOR_PROVIDER_URL using the repository's existing deployment environment" }
$env:TCAP_RPC_URL = $env:ANCHOR_PROVIDER_URL
node scripts/devnet-credit-smoke.mjs
```

Before running it, verify the repository-selected cluster and wallet rather
than replacing them with another provider setup:

```powershell
solana config get
solana address
solana balance
```

The cluster shown by `solana config get` must match `ANCHOR_PROVIDER_URL`.
Program IDs must match the checked-in Anchor keypairs/IDLs. The script performs
a read-only preflight for Mother Escrow, the TSN epoch commitment, the TCAP
asset entry, and reserve state before submitting a transaction.

The smoke script uses the existing `SOLANA_WALLET` convention, falling back to
the standard Solana CLI wallet path. It requires the already-created TSN
Mother Escrow, TSN epoch commitment, TCAP asset entry/reserve, and the
authorization fields in environment variables. Values are never printed.

Required non-secret environment names are:

```text
TSN_MOTHER_ESCROW, TCAP_ASSET_ENTRY, TCAP_RESERVE_STATE,
TCAP_TIP_ROOT_COMMITMENT, TCAP_INITIAL_COMMITMENT, TCAP_NEW_COMMITMENT,
TCAP_POLICY_COMMITMENT, TCAP_AUTHORIZATION_DIGEST, TCAP_NULLIFIER,
TCAP_ACCEPTED_INTENT_ROOT, TCAP_PREVIOUS_TCAP_ROOT, TCAP_ASSET_COMMITMENT,
TCAP_REPLAY_NONCE, TCAP_VALID_AFTER_SLOT, TCAP_EXPIRES_AT_SLOT,
TCAP_TOKEN_ID, TCAP_GPRU_SCOPE_COMMITMENT, TCAP_TSN_SETTLEMENT_COMMITMENT,
TCAP_EPOCH_ID, TCAP_SEQUENCE, TCAP_SNAPSHOT_KEY_HEX,
TCAP_PRIVATE_SNAPSHOT_JSON
```

`TCAP_SNAPSHOT_KEY_HEX` and `TCAP_PRIVATE_SNAPSHOT_JSON` are owner-local
inputs. They are consumed only in memory and are never printed. The JSON must
contain encrypted-locator metadata and local token balances; the script
verifies that its resulting commitment equals `TCAP_NEW_COMMITMENT` before
persisting ciphertext.

The TSN epoch commitment PDA is derived by the wrapper from
`TSN_MOTHER_ESCROW` and `TCAP_EPOCH_ID`; it is created on first authorized
credit and thereafter must match the supplied accepted-intent and previous-TCAP
roots. The payer wallet must have sufficient native Devnet SOL and be authorized by
the existing Mother/TSN deployment to invoke the CPI wrapper. The epoch
commitment must be active; the TCAP asset entry must be approved and unpaused;
and its reserve state must exist. Authorization inputs must match the current
tip (`previous_commitment` and `sequence = current + 1`), use a future expiry,
and use matching non-zero commitments and nullifier values.

## What executes

1. Initializes the deterministic TCAP tip if it does not exist.
2. Submits `tsn_register_tcap_credit_authorization`, the TSN CPI wrapper that
   invokes TCAP's `register_tsn_authorization_v1` with the TSN PDA signer.
3. Submits `credit_tcap_tin_tip_v1` and consumes the receipt/nullifier.
4. Encrypts and stores the local snapshot under `new_commitment`.
5. Fetches and decodes the tip through the same configured RPC and performs a
   local private read.

The wrapper is required because TCAP's authorization signer is a PDA owned by
the approved TSN program; a normal external transaction cannot forge that
signer. The path never invokes CrankerVault payout logic.

## Active-path boundary

### Devnet bootstrap order

The live smoke does not invent governance state or silently create production
accounts. An authorized Devnet operator must initialize and verify these
accounts in order:

1. TSN Mother Escrow and the canonical TSN epoch-commitment PDA for the chosen
   `TSN_MOTHER_ESCROW` and `TCAP_EPOCH_ID`.
2. TCAP global configuration (`initialize_tcap_v1`), commitment root
   (`initialize_commitment_root_v1`), asset registry/state and reserve
   (`initialize_asset_registry_v1`, `initialize_asset_state_v1`,
   `initialize_reserve_state_v1`, and the governed reserve/vault instructions).
3. The approved, active TCAP asset entry and reserve state must be readable at
   `TCAP_ASSET_ENTRY` and `TCAP_RESERVE_STATE`.
4. The smoke initializes the deterministic TIN tip with
   `initialize_tcap_tin_tip_v1` when the supplied root, initial commitment and
   policy commitment do not already have a tip account.

After bootstrap, export the complete checklist printed by the smoke into one
Devnet-only environment file and source it before the live run. The required
values include Mother Escrow, asset/reserve accounts, all commitment/nullifier
fields, epoch/sequence/expiry, token ID, snapshot key and private snapshot JSON.
The smoke defaults `TCAP_PROGRAM_ID` to the deployed Devnet program
`TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x` and prints every missing variable
in one checklist before failing.

This flow exercises only the TSN CPI authorization and
`credit_tcap_tin_tip_v1`, followed by owner-local encrypted snapshot storage
and read. It does not expose or call PRU funding/spend endpoints, confidential
debits/exits, or CrankerVault payout settlement.

## Devnet bootstrap

Run from the repository root in WSL (never localnet). First upgrade TCAP and
verify its `Last Deployed In Slot`; running bootstrap against old bytecode
causes `InstructionFallbackNotFound` for the migration instruction. Use two
explicit wallet roles: governance may migrate the config and initialize the
root, while the fixture wallet pays for the credit fixture. The bootstrap
prints both public keys and every reused or created PDA. It stops with an exact
`MISSING_DEPENDENCY` rather than fabricating commitments. Supply the governed
mint, owner-authorized TSN/TCAP commitments, nullifier/digest values, and real
owner token balances:

```bash
npm run deploy:lockfiles:stabilize
npm run deploy:doctor
npm run tcap:program:build:devnet
npm run tcap:program:deploy:devnet
solana program show TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x \
  --url "$ANCHOR_PROVIDER_URL"
```

```bash
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
export TRUSTLINK_TEST_WALLET_KEYPAIR="$PWD/protocol-tests/tcap-devnet-test-wallet.json"
export TCAP_GOVERNANCE_WALLET="$HOME/.config/solana/id.json"
# Existing governed Devnet fixture (verified asset/reserve path)
export TCAP_MINT="9ZqZ4fLxzSedkoZfUFYVXrbezNUbf41KxU9N5i6R92PK"
export TSN_PROTOCOL_SEED_HEX="<32-byte-authorized-protocol-seed>"
export TCAP_TIP_ROOT_COMMITMENT="<owner-authorized-32-byte-root>"
export TCAP_POLICY_COMMITMENT="<registered-policy-commitment>"
export TCAP_EPOCH_ID="<current-epoch>"
export TCAP_ACCEPTED_INTENT_ROOT="<TSN-accepted-intent-root>"
export TCAP_PREVIOUS_TCAP_ROOT="<TSN-previous-TCAP-root>"
export TCAP_ASSET_COMMITMENT="<registered-asset-commitment>"
export TCAP_AUTHORIZATION_DIGEST="<TSN-authorized-digest>"
export TCAP_NULLIFIER="<one-time-owner-authorized-nullifier>"
export TCAP_REPLAY_NONCE="<one-time-owner-authorized-replay-nonce>"
export TCAP_GPRU_SCOPE_COMMITMENT="<authorized-GPRU-scope>"
export TCAP_TSN_SETTLEMENT_COMMITMENT="<TSN-settlement-commitment>"
export TCAP_TOKEN_ID="<registered-token-id>"
export TCAP_TOKEN_BALANCES_JSON='[{"token_id":1,"native_amount":"100","stable_units":"100","stable_rate_version":1}]'
node protocol-tests/scenarios/tcap-credit-bootstrap.mjs
source protocol-tests/tcap-credit-devnet.env
node protocol-tests/scenarios/tcap-credit-smoke.mjs --dry-run
```

The fixed order is: verify upgraded TCAP bytecode, migrate the legacy config
if detected, initialize the commitment root, verify/reuse the governed asset
and reserve, initialize/reuse the tip, generate the owner snapshot env, then
run smoke preflight. Do not run the smoke before bootstrap completes.

### Controlled Devnet tip-root derivation

When `TCAP_TIP_ROOT_COMMITMENT` is omitted, bootstrap uses the TSN SDK helper
`deriveDevnetTestPrivacyReceivingRootCommitment(ownerPublicKey, identityLabel)`.
The formula is:

```text
material = SHA-256(canonical(
  "TSN_DEVNET_TEST_PRIVACY_ROOT_MATERIAL_V1",
  owner_public_key_base58,
  identity_label
))
tip_root_commitment = SHA-256(canonical(
  "TSN_PRIVACY_RECEIVING_ROOT_COMMITMENT_V1",
  hex(material)
))
```

The default label is `fixture-wallet-v1`. This is a controlled Devnet test
identity derivation only; it is not production wallet recovery or a spend key.
Build the SDK before bootstrap so the helper is available:

```bash
npm run tsn:sdk:build
```

For a new controlled Devnet tip, bootstrap similarly derives:

```text
policy_commitment = SHA-256(canonical(
  "TSN_DEVNET_TEST_POLICY_COMMITMENT_V1",
  owner_public_key_base58,
  identity_label
))

genesis_commitment = SHA-256(canonical(
  "TSN_DEVNET_TEST_TCAP_GENESIS_COMMITMENT_V1",
  owner_public_key_base58,
  identity_label,
  policy_commitment
))
```

These are controlled Devnet test-identity bindings only. They are not
production policy authorization, wallet recovery, spend keys, or a claim about
the owner’s live balance. Production callers must provide policy and genesis
commitments from the authorized device/intent.

The balance JSON and all commitment fields must come from the authorized owner/TSN intent; placeholders above are documentation only. The generated env contains the snapshot key and encrypted-snapshot input, so keep it private and do not commit it. The canonical TSN epoch commitment PDA is created/reused by the TSN authorization wrapper; it is not supplied as an opaque external account.

### Commitment-root dependency

`initialize_commitment_root_v1` accepts an `empty_tree_root` argument, but the deployed TCAP source does not define a production-wide constant. For this Devnet fixture, governance approved the explicit domain-separated value `47f64a304f10f65277568d1a061f669389cca93a55cac74712d7c1d99dddedff` (SHA-256 of `trustlink:tcap:devnet:empty-tree:v1`). This is Devnet fixture state only, not a production Merkle-root claim. The bootstrap uses it by default and persists it in the generated env; it never substitutes zero or a random value.

```bash
export TCAP_EMPTY_TREE_ROOT_HEX="47f64a304f10f65277568d1a061f669389cca93a55cac74712d7c1d99dddedff"
```

The signer must also be the `governance_authority` stored in the TCAP config. Set `TCAP_GOVERNANCE_WALLET` to the governance keypair when it differs from the fixture wallet. The fixture wallet remains the payer for the credit fixture. A governance-authority mismatch remains a hard blocker.

If the existing Devnet config is detected in the legacy pre-proof-verifier layout, the bootstrap submits the governance-only `migrate_tcap_config_layout_v1` instruction automatically (set `TCAP_RUN_CONFIG_MIGRATION=0` to require a manual migration). The TCAP program must be upgraded to include that instruction first.

### Troubleshooting the upgrade gate

- `InstructionFallbackNotFound`: TCAP Devnet bytecode predates
  `migrate_tcap_config_layout_v1`; rebuild and deploy TCAP, then verify the
  deployment slot before rerunning bootstrap.
- `AccountDidNotDeserialize`: the legacy config is still present and migration
  has not run against upgraded bytecode.
- `MISSING_DEPENDENCY TCAP_CONFIG_LAYOUT_MIGRATION`: migration was disabled or
  the program upgrade has not completed.
- `MISSING_DEPENDENCY TCAP_EMPTY_TREE_ROOT_HEX`: governance/root setup is not
  complete; never substitute a random or zero root.
