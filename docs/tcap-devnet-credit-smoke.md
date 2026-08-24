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
