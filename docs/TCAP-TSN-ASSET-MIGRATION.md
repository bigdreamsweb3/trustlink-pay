# TCAP canonical asset authority and TSN migration

**Date:** 2026-07-22  
**Scope:** architecture and migration specification  
**Implementation status:** `DESIGN_ONLY_FOR_TSN` / `NOT_BUILT` / `NOT_DEPLOYED`

This document defines how TSN must stop treating local token lists as asset
approval and instead consume the live TCAP asset registry. It deliberately does
not modify TSN source, claim that a new TSN instruction exists, or claim that a
new TSN binary has been deployed.

The governing rule is:

```text
TCAP asset acceptance
        AND
TSN payment policy for that TCAP asset
        =
TSN may create or settle an intent
```

TCAP rejection always wins. A TSN policy can narrow TCAP acceptance for payment
purposes; it can never broaden it.

## Status truth table

| Capability | Source | Build | Devnet deployment | Callable proof |
|---|---|---|---|---|
| Existing environment-backed TSN token catalog | Implemented and currently consumed | Existing application code | Off-chain deployment-specific | Not on-chain evidence |
| Existing TSN V1 `create_intent` mint argument | Implemented | Existing program source | A TSN program ID is configured, but this document performs no deployment probe | No TCAP asset validation |
| Existing non-spendable TSN-to-TCAP authorization record | Implemented in source | Existing program source | Not re-verified by this document | Does not establish asset acceptance |
| TCAP governed V2 policy companions | Source is present under active development | `BUILD_NOT_CONFIRMED_HERE` | `NOT_DEPLOYED` | `NOT_CALLABLE_CONFIRMED` |
| `TsnAssetPolicyV1` | `NOT_IMPLEMENTED` | `NOT_BUILT` | `NOT_DEPLOYED` | `NOT_CALLABLE` |
| TSN read-only TCAP canonical validation | `NOT_IMPLEMENTED` | `NOT_BUILT` | `NOT_DEPLOYED` | `NOT_CALLABLE` |
| TSN Token-2022 public transfer support | `NOT_IMPLEMENTED` | `NOT_BUILT` | `NOT_DEPLOYED` | `NOT_CALLABLE` |
| TSN Token-2022 Confidential Transfer execution | `NOT_IMPLEMENTED` | `NOT_BUILT` | `NOT_DEPLOYED` | `NOT_CALLABLE` |

The configured program addresses are:

- TCAP: `TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x`
- TSN: `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V`

These constants identify intended programs. They do not prove a particular
source revision or instruction is deployed. That proof requires a Devnet
program invocation and, for a state-changing success, a confirmed signature and
post-transaction account reads.

At the latest recorded mint preflight, the reserved Stable-TCAP address did not
yet have a Devnet account. Stable-TCAP therefore must not be represented as
TCAP-accepted until mint creation, governed registration, activation, policy
enablement, and live verification all succeed.

## Current TSN asset authority audit

TSN has no on-chain account that serves as a canonical accepted-token registry.
Its effective accepted-token catalog is off-chain and duplicated.

### SDK and application catalog

| Location | Current behavior | Migration risk |
|---|---|---|
| `tsn-protocol/tsn-sdk/src/token-registry.ts` | Defines `DEFAULT_ALLOWED_TOKENS`, defaults to Devnet USDC, parses `SOLANA_ALLOWED_SPL_TOKENS`, and falls back to the default on absent or invalid input | Local configuration is treated as acceptance; `tsnResolveAllowedToken` also returns an arbitrary custom mint when no catalog match exists |
| `backend/app/lib/env.ts` | Exposes `SOLANA_ALLOWED_SPL_TOKENS` to the backend | Environment state can diverge from TCAP state |
| `backend/app/blockchain/solana-core.ts` | Caches the SDK catalog, labels every configured entry `supported: true`, lists balances from it, and rejects only mints absent from that local cache | No TCAP owner, PDA, status, reserve, vault, or settlement-policy check |
| `backend/app/services/tsn.ts` | Uses `getAllowedTokenByMint` before creating an intent and before settlement preparation | Off-chain allowlist approval can disagree with TCAP |
| `backend/.env.example` | Documents the local JSON list | Configuration is useful for labels, but must stop authorizing assets |
| `backend/scripts/test-identity-binding.ts` | Reads the same environment list in a test helper | Test assumptions can conceal the authority mismatch |

### Mempool services and operator tooling

| Location | Current behavior | Migration risk |
|---|---|---|
| `tsn-protocol/tsn-mempool-backend/app/config.py` | Duplicates the environment parser, defaults to Devnet USDC, supplies decimals/price metadata, and hardcodes the classic SPL Token program | Independent acceptance and classic-token-only assumptions |
| `tsn-protocol/tsn-mempool-backend/app/solana.py` | Filters discovered Cranker vaults using local supported metadata; derives ATAs with the classic Token program | Hides live accounts based on local state and cannot derive Token-2022 ATAs correctly |
| `tsn-protocol/tsn-mempool-backend/app/services/auth.py` | Obtains token decimals from local metadata, defaulting to six | Wrong local decimals can change signed base-unit interpretation |
| `tsn-protocol/tsn-mempool-backend/server.py` | Contains another copy of catalog parsing and applies it to PRU spending, settlement, recovery, network overview, and decimal conversion | A second implementation can drift from the modular backend and from TCAP |
| `tsn-protocol/tsn-mempool-backend/.env.example` | Documents `SOLANA_ALLOWED_SPL_TOKENS` | Must become metadata-only after migration |
| `tsn-protocol/tsn-mempool-frontend/app/page.tsx` | Hardcodes the Devnet USDC mint and display symbol | Display metadata is mistaken easily for live acceptance |
| `tsn-protocol/tsn-cranker-op-daemon/scripts/guided-setup.mjs` | Reads the SDK catalog, but accepts an unmatched custom mint | Operator setup can bypass the nominal off-chain list |
| `tsn-protocol/tsn-cranker-op-daemon/scripts/cranker.ts` | Imports the classic `TOKEN_PROGRAM_ID` and derives classic token accounts | Token-2022 is not supported by the current settlement executor |
| `tsn-protocol/tsn-cranker-sdk/src/index.ts` | Re-exports the SDK token-catalog helpers | Propagates the same local authority model to Cranker clients |

After migration, these sources may retain symbol, name, icon, fiat-unit, and
display-price metadata. They must not produce `accepted`, `supported`, or
`settlement-enabled` without a fresh TCAP-derived decision.

### Existing on-chain TSN behavior

The current program source does not contain an accepted-token account:

- `tsn/instructions/create_intent.rs` accepts `token_mint: Pubkey` as instruction
  data. It does not receive or validate a mint account, TCAP registry, TCAP asset
  entry, TCAP governance policy, or TSN asset policy.
- `tsn/state/intent.rs` stores the mint on legacy `PaymentIntent`, but the value
  is not anchored to TCAP.
- `tsn/instructions/prepare_tcap_authorization.rs` accepts
  `tcap_program_id` and `asset_commitment` as arguments and creates a
  non-spendable record. It does not read the TCAP asset account.
- `tsn/state/v2.rs` defines commitment-oriented future layouts, including
  `PaymentIntentV2`, but there is no operational V2 intent-creation instruction
  using `TsnAssetPolicyV1`.
- `tsn/instructions/epoch_settlement.rs` treats `token_mint` as an unchecked
  account.
- Token-moving legacy instructions use `Program<'info, Token>` and
  `Account<'info, Mint>` from the classic SPL Token program. Examples include
  Cranker-vault initialization/funding/withdrawal, PRU spend, private payout,
  vault payout, proof submission, and TIN fee collection.

Consequently, an off-chain API check is not an on-chain authorization boundary.
A caller who can invoke a legacy instruction directly is constrained only by
that instruction's current accounts and authorities, not by TCAP acceptance.

## Canonical TCAP accounts

The proposed TSN gate consumes TCAP-owned state; TSN must not copy TCAP status
into an independently authoritative registry.

### Asset identity

The canonical TCAP asset entry remains `TcapAssetEntryV1`, whose PDA is:

```text
program: TCAP_PROGRAM_ID
seeds:
  "tcap:asset-entry:v1"
  asset_registry
  token_program
  mint
```

This makes `(registry, token program, mint)` the identity. Symbol and name are
never authority.

Because the V1 asset entry has no safe layout slack, governed lifecycle and
extension policy are companion accounts rather than an in-place reinterpretation:

```text
TcapAssetGovernancePolicyV2
PDA = ["tcap:asset-governance:v2", tcap_asset_entry]

TcapAssetExtensionPolicyV2
PDA = ["tcap:extension-policy:v2", tcap_asset_entry]
```

The governance companion separates:

- approval: `Pending`, `Approved`, `Rejected`, `Revoked`;
- operation: `Inactive`, `Active`, `Paused`, `Deprecated`;
- operation flags: deposits, settlements, public exit, confidential settlement;
- infrastructure readiness: reserve initialized and vault initialized;
- irreversible deprecation.

The extension companion binds mint, token program, decimals, mint profile,
mint/freeze authorities, required and allowed extension bitmaps, observed
extension bitmap, and an extension-configuration hash.

These V2 accounts are not yet a deployed TSN dependency. TSN integration cannot
be enabled until the corresponding TCAP source builds, is deployed under the
existing TCAP program ID, and is proven callable on Devnet.

## Proposed `TsnAssetPolicyV1`

TSN needs payment-network policy, not another asset registry.

### PDA

```text
const TSN_ASSET_POLICY_SEED = b"tsn:asset-policy:v1";

PDA = find_program_address(
  [
    TSN_ASSET_POLICY_SEED,
    mother_escrow,
    tcap_asset_record,
  ],
  TSN_PROGRAM_ID,
)
```

Including `mother_escrow` scopes policy to one TSN network configuration.
Including the TCAP asset record prevents two TSN records for the same canonical
asset in that network. Mint and symbol are not seeds because TSN must not use
them as an independent identity.

### Account layout

```rust
#[account]
pub struct TsnAssetPolicyV1 {
    pub version: u16,
    pub mother_escrow: Pubkey,
    pub tcap_program: Pubkey,
    pub tcap_registry: Pubkey,
    pub tcap_asset_record: Pubkey,
    pub tcap_governance_policy: Pubkey,
    pub tcap_extension_policy: Pubkey,

    // Cached for indexing only. Every use must revalidate these against TCAP.
    pub cached_token_program: Pubkey,
    pub cached_mint: Pubkey,
    pub cached_asset_commitment: [u8; 32],

    pub payment_intents_enabled: bool,
    pub cranker_settlement_enabled: bool,
    pub minimum_amount: u64,
    pub maximum_amount: u64,
    pub fee_policy: Pubkey,
    pub settlement_modes: u16,
    pub status: TsnAssetPolicyStatusV1,
    pub policy_sequence: u64,
    pub authority: Pubkey,
    pub last_updated_slot: u64,
    pub bump: u8,
    pub reserved: [u8; 32],
}

pub enum TsnAssetPolicyStatusV1 {
    Draft,
    Active,
    Paused,
    Deprecated,
}
```

The cached fields are never sufficient for authorization. They exist only to
make indexing and mismatch diagnostics practical.

### Policy administration

Only `mother_escrow.authority` may link, update, pause, or deprecate a TSN asset
policy. A Cranker, payer, browser wallet, backend service, or token mint
authority must not administer this account.

A new policy begins `Draft` with both action flags disabled. Activation requires
a passing live TCAP settlement gate. Deprecation is one-way unless a separately
versioned governance migration is implemented.

The linking instruction emits `TsnAssetPolicyLinkedV1` with the TSN network,
TCAP program, TCAP registry, TCAP asset record, mint, token program, authority,
and slot. Updates require similarly versioned events.

## Fail-closed validation contract

Every new intent-creation and settlement instruction must receive the live
accounts below. Validation at policy-link time alone is insufficient because
TCAP can pause, revoke, or deprecate an asset afterward.

### Required accounts

- TSN `MotherEscrow`;
- TSN `TsnAssetPolicyV1`;
- executable TCAP program account;
- TCAP global config;
- TCAP asset registry;
- TCAP asset entry;
- TCAP governance-policy companion;
- TCAP extension-policy companion;
- mint account;
- the token program selected by the TCAP asset;
- reserve and canonical vault when the requested operation depends on them.

### Validation order

The instruction rejects before writing TSN state unless every check passes:

1. The TSN `MotherEscrow` is the canonical PDA and owns the supplied policy.
2. The `TsnAssetPolicyV1` PDA is canonical for `(mother escrow, TCAP asset
   record)`, has the expected discriminator/version, and is `Active`.
3. The supplied TCAP program equals the configured canonical TCAP program, is
   executable, and is not merely a caller-provided arbitrary executable.
4. TCAP global config, registry, asset entry, governance companion, extension
   companion, reserve, and vault accounts are all owned by that TCAP program
   where applicable.
5. The TCAP global-config and registry PDAs are canonical; global protocol pause
   and registry freeze are both false.
6. The TCAP asset-entry PDA is re-derived from the registry, token program, and
   mint and equals the supplied account.
7. Both TCAP companion PDAs are re-derived from the asset entry and equal the
   supplied accounts.
8. All account cross-references agree: registry, asset entry, governance policy,
   extension policy, reserve, vault, mint, token program, decimals, and asset
   commitment.
9. TCAP approval is `Approved`.
10. TCAP operational status is `Active`; pause and irreversible-deprecation
    flags are false.
11. `settlements_enabled` is true for any TSN payment intent that can reach
    settlement. A funding-only adapter separately requires `deposits_enabled`.
12. Reserve and vault are initialized; their addresses match the asset entry;
    vault mint, owner/authority, and owning token program are canonical.
13. The mint account is owned by the exact TCAP-recorded token program and its
    decimals match the extension policy.
14. The TSN policy's cached mint, token program, asset commitment, and TCAP
    pointers exactly match the live TCAP records.
15. The TSN action flag is enabled, the requested settlement mode is permitted,
    and amount is within `[minimum_amount, maximum_amount]` using the live mint
    decimals.
16. The payment intent binds the TCAP asset record and asset commitment, not
    only the mint.

Any decode failure, missing account, wrong owner, wrong PDA, unknown enum,
unsupported version, or unrecognized extension is a rejection. There is no
fallback to `SOLANA_ALLOWED_SPL_TOKENS`, Devnet USDC, six decimals, or a custom
mint.

### Recheck points

The full TCAP gate is required at:

- TSN policy activation;
- payment-intent creation;
- intent authorization or epoch admission;
- Cranker settlement preparation;
- immediately before any TCAP CPI or TSN token movement.

If TCAP changes between intent creation and settlement, settlement fails closed.
Existing intent resolution must then follow an explicit refund, expiry, or
governed migration path; it must not settle through a locally cached approval.

### CPI boundary

Reading and validating TCAP-owned accounts does not require CPI. TSN should use
plain read-only account validation for admission.

CPI is required only when TCAP must mutate TCAP-owned state, such as consuming a
funding claim, changing confidential ownership, consuming a nullifier, executing
a public exit, or moving assets under the TCAP reserve-authority PDA. TSN can
never sign for that PDA itself.

## Token-2022 and Confidential Transfer limitations

The current TSN token-moving source is classic-SPL-only. Stable-TCAP cannot be
enabled in TSN merely because TCAP later accepts its Token-2022 asset record.

Before Token-2022 public settlement can be enabled, TSN must:

- replace hardcoded `Program<Token>` / classic `Mint` and token-account types in
  the new path with `TokenInterface` / interface accounts;
- bind the passed token program to the TCAP asset record;
- derive associated token accounts with that exact token program;
- use checked transfers and validate actual received amounts where an allowed
  extension can change transfer economics;
- reject extension combinations outside TCAP's exact extension policy;
- leave legacy classic-token instructions isolated and unable to operate on
  TCAP Token-2022 vaults.

Token-2022 Confidential Transfer is not a transparent replacement for a public
transfer. It requires configured token accounts, cryptographic account material,
proof generation, pending-balance handling, and explicit apply/withdraw flows.
TSN must not infer or decrypt a confidential balance from public account data.

The two confidentiality layers remain separate:

- **Token-2022 confidential balance:** encrypted balance and transfer amount on
  a Token-2022 token account; token account addresses remain public.
- **TCAP confidential ownership:** a reserve-backed ownership commitment or
  container managed by TCAP.

Approval for one does not activate the other. A standard public TSN intent, a
Token-2022 confidential transfer, and TCAP confidential settlement require
separate settlement-mode bits, executors, evidence, and tests.

The pinned CLI exposing Confidential Transfer commands is useful toolchain
evidence, but it is not proof that TSN source, deployed TSN bytecode, or the
Stable-TCAP mint supports those operations.

## Migration phases

### Phase 0 — Inventory and freeze authority expansion

- Inventory every consumer of `SOLANA_ALLOWED_SPL_TOKENS` and every direct TSN
  instruction constructor.
- Treat all current local lists as compatibility metadata only in new code.
- Do not add Stable-TCAP to a local list and call it accepted.
- Keep existing legacy flows unchanged until their liabilities and dependencies
  are understood.

**Exit gate:** documented consumer inventory and no claim that local metadata is
TCAP acceptance.

### Phase 1 — Establish live TCAP canonical state

- Finish, review, test, and build governed TCAP companion accounts.
- Deploy the upgraded TCAP binary under the unchanged TCAP program ID.
- Prove each required instruction callable on Devnet.
- Create Stable-TCAP with its final immutable extension set.
- Register it in a safe initial state, initialize reserve/vault, approve,
  activate, and enable only implemented operation flags.
- Inspect and safely pause/deprecate the old fixture without closing non-zero or
  referenced state.

**Exit gate:** `tcap:asset-admin verify` returns `ACCEPTED` from live Devnet
accounts for the required operation. No local IDL or config is deployment proof.

### Phase 2 — Add TSN policy linkage and read-only TCAP gate

- Implement `TsnAssetPolicyV1` and authority-only link/update instructions.
- Implement a shared on-chain TCAP account validator used by every new TSN path.
- Add `TsnAssetPolicyLinkedV1` and update events.
- Update off-chain TSN services to query the same live accounts and surface the
  exact rejection reason, while retaining local catalogs only for labels.
- Build and test TSN; do not deploy until adversarial tests pass.

**Exit gate:** direct instruction tests prove a fake/offline allowlist cannot
authorize an asset.

### Phase 3 — Require TCAP at intent creation and settlement

- Introduce versioned TSN intent instructions that bind the TCAP asset record.
- Require the gate at intent creation, epoch admission, and settlement.
- Prevent legacy records from authorizing new assets.
- Deploy under the verified TSN program ID only after build and IDL review.
- Prove the deployed handler with a minimal Devnet transaction.

**Exit gate:** pausing or revoking the TCAP asset immediately blocks new TSN
intents and settlement, even when the local catalog still contains the mint.

### Phase 4 — Token-2022 public-path support

- Add a versioned `TokenInterface` path bound to the TCAP token program.
- Keep classic and Token-2022 executors explicit; do not dispatch from a symbol.
- Support only the exact extension set approved in the TCAP extension policy.
- Verify received amounts, vault ownership, fees, and account changes.

**Exit gate:** confirmed Devnet transactions and state diffs for one allowed
Token-2022 asset, plus rejection evidence for wrong program and extensions.

### Phase 5 — Confidential modes

- Implement Token-2022 confidential account configuration/transfer separately
  from TCAP confidential ownership settlement.
- Require local proof/key handling and sanitized evidence.
- Enable each mode in TCAP and TSN only after its executor is implemented and
  independently tested.

**Exit gate:** confirmed mode-specific evidence without claiming unlinkability or
mixing the two confidential balance models.

### Phase 6 — Retire compatibility lists

- Remove local-list authorization after every caller uses live TCAP validation.
- Retain optional metadata keyed by canonical mint for labels only.
- Deprecate or close old TSN policy state only if no deployed instruction or
  historical record requires it and a safe close instruction exists.

**Exit gate:** repository search and runtime tests show no acceptance decision
originates from `SOLANA_ALLOWED_SPL_TOKENS`.

## Security and regression tests

### TCAP authority and lifecycle

- unauthorized registration, approval, activation, pause, deprecation, or policy
  change rejects;
- duplicate `(registry, token program, mint)` registration rejects;
- activation before reserve and vault initialization rejects;
- deposits or settlement while disabled/paused reject;
- deprecated assets cannot be reactivated through a legacy instruction;
- old assets with balances, liabilities, claims, or references cannot close;
- wrong mint, token program, decimals, authority, extension set, reserve, vault,
  or vault authority rejects.

### TSN canonical gate

- local allowlist says accepted while TCAP says rejected: reject;
- no local metadata while TCAP and TSN policies accept: authorization does not
  depend on the metadata list;
- fake TCAP asset entry with correct-looking bytes but wrong owner: reject;
- real TCAP-owned account at wrong PDA: reject;
- wrong TCAP program ID or non-executable program: reject;
- governance/extension companion belonging to another asset: reject;
- cached mint, program, commitment, registry, reserve, or vault mismatch: reject;
- TCAP `Pending`, `Rejected`, `Revoked`, `Inactive`, `Paused`, or `Deprecated`:
  reject;
- registry frozen or TCAP globally paused: reject;
- settlement flag disabled: reject intent/settlement mode as specified;
- stale policy: create intent, pause asset in TCAP, then prove settlement rejects;
- direct on-chain invocation bypassing all backend services still rejects;
- unauthorized TSN policy link/update rejects;
- duplicate TSN policy for one TCAP asset rejects;
- amount below minimum, above maximum, overflowed, or decoded with wrong decimals
  rejects;
- wrong or unknown settlement mode rejects.

### Token programs and extensions

- classic token mint passed with Token-2022 program, and vice versa: reject;
- Token-2022 asset passed to a legacy classic-only instruction: reject;
- unsupported transfer fee, transfer hook, permanent delegate, default account
  state, non-transferable, interest-bearing, mint-close-authority, or any unknown
  extension: reject unless a later audited TCAP policy explicitly supports it;
- changed extension configuration hash: reject;
- failed Confidential Transfer proof causes no confirmed mutation;
- Token-2022 confidential balance is never reported as TCAP confidential
  ownership.

### Evidence requirements

Tests must separately label:

- `LOCAL_CLIENT_METADATA` for IDLs, symbols, and environment catalogs;
- `DEVNET_SIMULATION_EVIDENCE` for a deployed handler reached in simulation;
- `CONFIRMED_DEVNET_EVIDENCE` only for a confirmed signature plus fetched state.

No test may turn a local IDL, an executable program account, or an off-chain
allowlist into proof that an instruction or asset is deployed and accepted.

## Fail-closed rejection vocabulary

The shared TSN client and UI should expose one precise reason rather than
falling back:

```text
TCAP_PROGRAM_MISMATCH
TCAP_PROGRAM_NOT_EXECUTABLE
TCAP_ACCOUNT_OWNER_MISMATCH
TCAP_PDA_MISMATCH
TCAP_STATE_DECODE_FAILED
TCAP_VERSION_UNSUPPORTED
TCAP_PROTOCOL_PAUSED
TCAP_REGISTRY_FROZEN
TCAP_APPROVAL_PENDING
TCAP_APPROVAL_REJECTED
TCAP_APPROVAL_REVOKED
TCAP_ASSET_INACTIVE
TCAP_ASSET_PAUSED
TCAP_ASSET_DEPRECATED
TCAP_SETTLEMENT_DISABLED
TCAP_RESERVE_NOT_INITIALIZED
TCAP_VAULT_NOT_INITIALIZED
TCAP_MINT_MISMATCH
TCAP_TOKEN_PROGRAM_MISMATCH
TCAP_EXTENSION_POLICY_MISMATCH
TSN_ASSET_POLICY_MISSING
TSN_ASSET_POLICY_INACTIVE
TSN_PAYMENT_INTENTS_DISABLED
TSN_CRANKER_SETTLEMENT_DISABLED
TSN_AMOUNT_OUT_OF_POLICY
TSN_SETTLEMENT_MODE_DISABLED
TOKEN_2022_NOT_IMPLEMENTED
CONFIDENTIAL_MODE_NOT_IMPLEMENTED
```

Unknown state maps to rejection, never acceptance.

## Implementation checklist

- [ ] TCAP governed source compiles and tests pass.
- [ ] TCAP V2 IDL generated from the same build artifact.
- [ ] TCAP V2 deployed under the existing program ID.
- [ ] Required TCAP instructions proven callable on Devnet.
- [ ] Stable-TCAP mint created with final extension set.
- [ ] Stable-TCAP live TCAP policy returns accepted for the intended operation.
- [ ] `TsnAssetPolicyV1` source implemented.
- [ ] TSN canonical account validator implemented and shared by new instructions.
- [ ] New TSN intent path binds the TCAP asset record.
- [ ] New TSN settlement path rechecks TCAP.
- [ ] TSN Token-2022 public path implemented and tested.
- [ ] Confidential paths implemented and tested separately.
- [ ] TSN built, IDL generated, deployed, and probed.
- [ ] Off-chain lists reduced to metadata only.
- [ ] Legacy state retirement proven safe.

Until the relevant boxes are complete, the truthful status is:

```text
TCAP_TO_TSN_CANONICAL_ASSET_LINK: NOT_IMPLEMENTED
TSN_ASSET_POLICY_V1: NOT_IMPLEMENTED
TSN_TOKEN_2022_SETTLEMENT: NOT_IMPLEMENTED
TSN_CONFIDENTIAL_TRANSFER: NOT_IMPLEMENTED
DEVNET_DEPLOYMENT: NOT_PERFORMED
DEVNET_CALLABILITY: NOT_CONFIRMED
```
