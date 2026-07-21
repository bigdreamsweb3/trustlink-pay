# TCAP Phase 3 status

This document records the current boundary before any production-fund migration.

## Ownership classification

| Classification | Current locations |
| --- | --- |
| TSN responsibility | `PaymentIntentV2`, epoch commitments, TSN fee reserve, settlement receipts, reward allocations in `tsn-protocol/tsn/protocol/programs/trustlink-escrow/src/tsn/state/v2.rs` |
| TCAP responsibility | `TcapGlobalConfigV1`, asset registry/entries, reserve-state metadata, pending liabilities, nullifier state, commitment roots, reserve-authority PDA domains in `tcap-protocol/programs/tcap/src` |
| Shared CPI interface | `TsnSettlementAuthorizationV1`; TCAP's non-spendable authorization receipt and compatibility reader for the TSN epoch account |
| Temporary migration scaffold | The independent `tcap-protocol` Anchor workspace and SDK initialization models; all funding and proof-dependent paths remain disabled |
| Legacy dependency | TSN `vault.rs`, `mother_escrow.rs`, Cranker liquidity, reimbursement and payout instructions. They remain untouched for compatibility and do not own TCAP accounts. |

## Phase 3 implementation boundary

The TCAP program currently exposes initialization-only instructions. It creates metadata and accounting state, but no token vault, deposit, transfer, redemption, confidential output, pending liability funded by real assets, or accepting proof verifier. The reserve and future-vault addresses are PDA metadata only.

The TSN-to-TCAP authorization path verifies the governance-bound TSN executable, TSN epoch owner/discriminator, epoch/root fields, asset and reserve bindings, slot bounds, replay PDA, and TCAP root. The resulting receipt is explicitly non-spendable.

## Build evidence

- `cargo metadata --no-deps --format-version 1` (`tcap-protocol`): passed.
- `cargo check --workspace` (`tcap-protocol`): passed with Anchor cfg and glob-reexport warnings only.
- TSN workspace check: currently inconclusive when concurrent Cargo processes hold the build-directory lock; rerun serially after the lock clears. A timeout is not treated as success.
- SDK tests are present, but this Windows environment currently returns `EPERM` while Node/npm resolves `C:\Users\codepara`; rerun in a normal Node shell.

## Program identity

The development ID is `TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x`. It is now mirrored in the SDK source-of-truth module and checked against `declare_id!` and `Anchor.toml` by:

```text
npm run validate:program-id --prefix tcap-protocol/tcap-sdk
```

The local keypair directory is ignored and must be checked with `solana-keygen pubkey` before deployment. No deployment is performed in Phase 3.

## Phase 4 recommendation

Add adversarial on-chain tests and a TSN-owned authorization-record/signer adapter first. Only after those pass should audited verifier configuration and non-production transition receipts be introduced. Deposits, proof acceptance, confidential transfers, public redemption, and production fund movement remain out of scope.
