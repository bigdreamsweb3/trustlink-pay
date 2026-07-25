# TCAP Asset Policy Audit

This document records the findings from the repository-wide audit for governed asset policy components that enforce allowlisting, admin approvals, or accepted-token status.

## Audit Findings

| File | Line / Symbol | Current Behavior | Type | Required Correction | Impact on Account Layouts |
|---|---|---|---|---|---|
| `programs/tcap/src/state.rs` | `TcapAssetRegistryV1` | Stores global registry state and root for all approved assets. | TCAP allowlist policy | Retain struct for legacy history only. Do not use in Stable-TCAP active logic. | Preserves legacy compatibility. Stable-TCAP will not initialize this. |
| `programs/tcap/src/state.rs` | `TcapAssetEntryV1` | Stores per-mint approval, status, and policy. | TCAP allowlist policy | Retain struct for legacy history only. Do not use in Stable-TCAP active logic. | Preserves legacy compatibility. Stable-TCAP replaces this with `TcapAssetStateV1`. |
| `programs/tcap/src/state.rs` | `TcapAssetStatusV1`, `TcapRiskStateV1` | Enum defining active, paused, deprecated, pending, approved states. | TCAP allowlist policy | Retain for legacy decoding. Remove from active validation. | None. |
| `programs/tcap/src/instructions/legacy.rs` | `register_asset_v1` | Requires `registry_authority` to approve and add a mint to the registry. | TCAP allowlist policy | Remove from active router or restrict to legacy decoding. | Stable-TCAP will instead use permissionless `initialize_asset_state_v1`. |
| `programs/tcap/src/instructions/legacy.rs` | `update_asset_status_v1` | Admin instruction to change asset states (Active, Deprecated). | TCAP allowlist policy | Remove or isolate from active router. | No active asset status flags will exist in Stable-TCAP. |
| `programs/tcap/src/instructions/legacy.rs` | `set_asset_deposit_policy_v1` | Admin instruction to toggle deposits. | TCAP allowlist policy | Remove or isolate from active router. | No active deposit policy flags will exist. |
| `programs/tcap/src/instructions/deposit_asset_v1.rs` | `asset_entry.deposits_enabled` | Validates that an admin has enabled deposits for the asset. | TCAP allowlist policy | Remove check in Stable-TCAP implementation. | None. |
| `programs/tcap/src/instructions/deposit_with_funding_commitment_v1.rs` | `asset_entry.deposits_enabled` | Validates that deposits are enabled. | TCAP allowlist policy | Remove check. | None. |
| `programs/tcap/src/asset_governance.rs` | `register_governed_asset_v2` | Advanced V2 governed registration. | TCAP allowlist policy | Remove or isolate from active router. | Replaced by permissionless model. |
| `programs/tcap/src/asset_governance.rs` | `set_asset_approval_v2` | Sets V2 approval state. | TCAP allowlist policy | Remove or isolate from active router. | Replaced by permissionless model. |
| `programs/tcap/src/instructions/deposit_asset_v2.rs` | `governance_policy.accepted_for_deposits()` | Requires V2 governance approval for funding. | TCAP allowlist policy | Remove check and `governance_policy` account dependency. | Simplifies funding instruction layout. |
| `programs/tcap/src/instructions/deposit_with_funding_commitment_v2.rs` | `governance_policy.accepted_for_deposits()` | Requires V2 governance approval for funding. | TCAP allowlist policy | Remove check and `governance_policy` account dependency. | Simplifies funding instruction layout. |
| `programs/tcap/src/error.rs` | `AssetNotApproved`, `InvalidAssetOperationalStatus`, `AssetUnavailable` | Emitted when governed policies reject interactions. | TCAP allowlist policy | Remove errors or leave unused. | None. |

## Canonical Corrective Action

Stable-TCAP will use a **FIRST VALID USE** initialization model.
Any user can call `initialize_asset_state(mint)` permissionlessly.
This will construct a minimal `TcapAssetStateV1` containing only technical accounting metadata (like decimals) and initialize the `TcapReserveStateV1`.
No global registries (`TcapAssetRegistryV1`), authorities (`registry_authority`), or asset entry approvals (`TcapAssetEntryV1`) will be required or checked in active funding or settlement paths.

## Account Layout Consequences

Because we are deploying Stable-TCAP as a new program ID (`STABLE_TCAP_DEVNET`), we do not need to perform complex data migrations on the `LEGACY_DEVNET_REFERENCE` accounts. We will retain the legacy structures (`TcapAssetRegistryV1`, `TcapAssetEntryV1`) in the codebase exclusively for historical decoding, and introduce `TcapAssetStateV1` as the new canonical state for the Stable-TCAP program.
