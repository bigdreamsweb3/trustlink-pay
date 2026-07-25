# TCAP governed asset lifecycle

Status: source implementation and live read-only administration are available.
The V2 TCAP instructions are **not built, deployed, or proven callable on
Devnet yet**. This document is not deployment evidence.

## Canonical acceptance rule

TCAP is the canonical asset authority. An asset is usable for public reserve
funding only when every live check succeeds:

```text
approval_status == APPROVED
operational_status == ACTIVE
deposits_enabled == true
reserve_initialized == true
vault_initialized == true
deprecated_irreversible == false
mint/token program/decimals/authorities/extensions match governed policy
reserve and vault PDAs are canonical
vault mint and authority are canonical
reserve.actual_assets == vault.amount
reserve.funding_enabled == true
reserve.paused == false
```

Settlement additionally requires `settlements_enabled`. The current source
refuses to enable settlement because the corresponding mutation is not yet
implemented. No UI, TSN allowlist, or local metadata file may override a TCAP
rejection.

Emergency governance is fail-safe: `INACTIVE`, `PAUSED`, `DEPRECATED`, and
approval revocation remain callable if mint authorities/extensions drift or
the vault balance no longer matches accounting. Only activation/resume and
operation enabling require the complete strict health check. The governed
infrastructure sync may reconcile an unsolicited vault inflow upward, emits
`ReserveAssetsReconciledV2`, refuses to hide any vault loss, and requires the
live vault still cover every recorded liability.

## Mint profiles

- `STANDARD_PUBLIC` (**standard public-balance mint**): conventional public balances and transfers; Confidential
  Transfer is prohibited by this profile.
- `CONFIDENTIAL_TRANSFER_ENABLED` (**confidential-transfer-enabled mint**): Token-2022 Confidential Transfer is required
  at mint creation. Required and allowed extension bitmaps bind the exact
  governed extension set.

Both profiles also bind decimals, mint authority, freeze authority, extension
configuration hash, mint, and token program. Stable-TCAP uses
`CONFIDENTIAL_TRANSFER_ENABLED` with Confidential Transfer, Metadata Pointer,
and Token Metadata; transfer fees, hooks, permanent delegate, default account
state, non-transferable, interest-bearing, and mint-close-authority extensions
are rejected.

The V2 funding preimage binds a public `randomness_commitment`; raw funding
randomness stays client-local and is never placed in Solana instruction data.
The deployed legacy V1 handler still uses a public `salt` field, which is one
reason V1 must be disabled by the version gate before governed assets are
enabled.

## Versioned migration gate

`minimum_instruction_version` is the irreversible bypass-prevention gate.
Migration order is mandatory:

1. Upgrade TCAP under its existing program ID and prove each required V2
   handler with Devnet simulation or a confirmed minimal transaction.
2. Enter an announced maintenance window and raise
   `minimum_instruction_version` from 1 to 2. This closes every legacy
   mutation/deposit bypass before any governed policy is trusted.
3. Migrate every legacy asset to governance and extension-policy companion
   PDAs through the V2 migration instruction.
4. Synchronize and verify existing reserve/vault infrastructure.
5. Disable and safely retire the old fixture as required.
6. Register, approve, initialize, activate, and enable Stable-TCAP.

Once raised, legacy registration, status, reserve/vault initialization,
deposit-policy, deposit, funding-deposit, and TSN-authorization instructions
fail with `LegacyInstructionDisabled`.

The gate is deliberately raised before migration, not afterward. That creates
a controlled maintenance window in which legacy assets cannot accept deposits,
but avoids a period where V1 governance paths could bypass V2 policy accounts.

## Existing Devnet fixture

The last saved confirmed account snapshot identifies one legacy asset:

- mint: `9ZqZ4fLxzSedkoZfUFYVXrbezNUbf41KxU9N5i6R92PK`;
- asset record: `5eCMtSBo9wvtKuBrtqjy14F6GwfdVdDvgzyhto51n7RP`;
- reserve: `FjE8mUKDRsVg97F3Ny2sWkegYHsgfcCSGerhgjfzKH1a`;
- canonical vault: `A9pNUuLcQbiCKBHgfhEoLwV9GmQz1cfH8u1qUDPPZre8`;
- vault balance and `actual_assets`: 10,406 base units;
- pending funding liabilities: zero in that snapshot.

Because actual assets remain in custody, the record must not be closed. The
safe decision is disable new use, preserve/resolve the remaining test assets,
and retain a deprecated tombstone. TCAP currently has no audited close or
liability-evacuation instruction.

The legacy mint/asset/reserve/vault identities are also still referenced by
active development fixtures in `protocol-tests/config/trustlink-test-asset.devnet.json`,
`protocol-tests/config/trustlink-test-asset.discovery.json`,
`protocol-tests/config/verified-devnet-stables.json`,
`tcap-protocol/scripts/devnet-funding-claim.mjs`, and
`tcap-protocol/tests/deposit-phase1-devnet.test.mjs`. Those references must be
migrated deliberately; they are additional evidence against deleting or
overwriting the old record.

## Administration CLI

Read-only commands query Devnet accounts directly and never treat an IDL as
deployed evidence:

```bash
npm run tcap:asset-admin -- list --cluster devnet
npm run tcap:asset-admin -- inspect --mint <MINT> --cluster devnet
npm run tcap:asset-admin -- verify --mint <MINT> --cluster devnet
```

Lifecycle mutation builders are implemented for registration, legacy-policy
migration, approval/rejection/revocation, operational status, reserve/vault
initialization, infrastructure sync, deposit policy, settlement disabling,
and the V2 instruction-version gate. A mutation first loads live state,
previews exact accounts/data, simulates, and stops for review. Submission
requires both the explicit governance keypair configuration and `--confirm`,
then verifies the confirmed post-state and writes sanitized evidence. A
passing simulation that does not prove both TCAP invocation and the expected
deployed handler remains fail-closed. Settlement enabling and account closure
remain unavailable; `close` always returns
`SAFE_CLOSURE_NOT_IMPLEMENTED_PRESERVE_DEPRECATED_TOMBSTONE`.

This is deliberate: a source file or local IDL is not authority to mutate
Devnet.

## Stable-TCAP deployment gates

Before mint creation:

1. Re-derive the faucet state and mint-authority PDAs.
2. Confirm the reserved mint account is absent on Devnet.
3. Build and test the TCAP V2 and faucet artifacts with the pinned WSL
   toolchain.
4. Review the exact Confidential Transfer configuration and metadata.

After mint creation, but before calling the asset accepted:

1. Verify mint owner, decimals, authorities, and complete extension set from
   Devnet.
2. Upgrade TCAP and prove the required V2 handlers.
3. Register a unique asset record plus governance and extension policies.
4. Approve it, initialize reserve and canonical vault, activate it, then enable
   deposits.
5. Run `tcap:asset-admin verify`; only `ACCEPTED` is usable in the wallet.
