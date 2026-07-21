# TCAP Deposit Phase 1 — internal security review

This is an internal implementation review, not an independent audit. It was
performed against the standalone deposit boundary before localnet execution.

| Finding | Severity | Mitigation / test status |
|---|---|---|
| Token-2022 behavior could make requested and received amounts differ | High | `SPL_TOKEN_PROGRAM_ID` checks in registration, vault initialization, policy update, and deposit. Test: `rejects_token_2022`. Remaining risk: localnet evidence pending. |
| Vault substitution | High | Canonical TCAP future-vault PDA, stored metadata, mint, and reserve-authority constraints. Test: `rejects_substituted_vault`. Remaining risk: localnet evidence pending. |
| Source authority confusion | High | Source token owner must equal the depositor signer and the signer is used for `transfer_checked`. Tests: `rejects_wrong_source_owner`, `rejects_missing_depositor_signature`. Remaining risk: localnet evidence pending. |
| Accounting before CPI success | High | The token CPI executes before checked `actual_assets` mutation. Test: `failed_transfer_is_atomic`. Remaining risk: localnet evidence pending. |
| Duplicate vault initialization | Medium | Anchor `init` and canonical PDA prevent reinitialization. Test: `rejects_duplicate_vault_init`. Remaining risk: localnet evidence pending. |
| Governance bypass | High | Deposit policy requires the configured governance signer and an active, approved asset. Tests: `rejects_unauthorized_policy`, `rejects_paused_policy`. Remaining risk: localnet evidence pending. |
| Arithmetic overflow | Medium | `checked_add` returns `ArithmeticOverflow`. Test: `rejects_accounting_overflow`. Remaining risk: localnet evidence pending. |
| Arbitrary CPI / reentrancy | Medium | The token program is bound to canonical SPL Token and the instruction performs one fixed CPI; no external callback is accepted. |
| Confidentiality leakage | Low for this phase | Deposits are intentionally public. Events do not contain future note secrets; no confidential ownership is created. |

Outstanding validation work is integration testing on a local validator. No
finding should be considered closed until the corresponding test passes.
