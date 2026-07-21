# TCAP Program Boundary and Relocation Plan

**Decision:** TCAP is an independent Solana program. It must never deploy under the legacy TSN escrow program ID.

## Classification of Phase 1 and Phase 2 changes

| Change | Classification | Final location/action |
|---|---|---|
| `tcap-protocol/tcap-sdk` contracts, domains, proof interfaces and validation | Shared type/interface | Independent `@trustlink/tcap-sdk`; applications and TSN adapters consume it |
| `docs/TCAP-MIGRATION-PLAN.md` | Temporary migration scaffold | Remains cross-program migration documentation |
| `docs/TCAP-SETTLEMENT-AUTHORIZATION.md` | Shared protocol specification | Canonical cross-program authorization contract |
| `PaymentIntentV2`, epoch commitments, fee reserve, settlement receipts, reward allocation | TSN responsibility | TSN-owned V2 state scaffold under `tsn/state/v2.rs`; final TSN instructions remain disabled |
| Asset registry, asset entries, principal reserves, pending liabilities, nullifiers and ownership roots | TCAP responsibility | Separate `tcap-protocol/programs/tcap` program |
| `src/tcap/` added under legacy `trustlink-escrow` | Incorrectly placed legacy dependency | Removed from legacy module and relocated to independent TCAP crate |
| Legacy `CrankerVault`, `LiquidityPosition`, reimbursement and escrow instructions | Incorrect legacy architecture for final design | Kept only for compatibility until staged migration completes; never permitted to reference TCAP vaults |

## Independent program boundary

The TCAP workspace owns:

- its own crate and program ID;
- independent Anchor deployment configuration;
- TCAP-specific account discriminators and PDA seed domains;
- asset registry and isolated reserve authority;
- pending/settled liability accounting;
- nullifiers and confidential ownership roots;
- proof-verification and public-redemption instructions when Phase 3 authorizes them.

The current development program ID is a non-deployed configuration identity. No deployment keypair is committed and it must be regenerated/synchronized through the release process before deployment.

## TSN/TCAP communication

TSN owns intents, epochs, Cranker eligibility, fee reserves and reward allocation. It communicates with TCAP through:

1. explicit versioned CPI instructions exposed by the TCAP program; or
2. immutable verified authorization records/root commitments consumed by TCAP.

TSN may supply an accepted epoch root and settlement authorization inputs. TCAP independently verifies the configured TSN program/authorization domain, proof, nullifier, asset entry, vault, liabilities and state transition. TSN can never sign for the TCAP reserve-authority PDA.

## Compatibility adapters

During migration, TSN may expose adapters that translate `PaymentIntentV2` and epoch records into TCAP CPI request types. Adapters hold no principal, cannot substitute vaults and cannot bypass TCAP proof verification. Legacy payout/reimbursement instructions remain isolated from all TCAP PDA domains.

## Boundary tests

Phase 2 includes deterministic tests proving:

- the TCAP reserve authority derives under the TCAP program ID;
- the same seeds under the TSN program ID produce a different PDA;
- reserve-state and reserve-authority domains are distinct;
- the legacy TSN crate no longer compiles or exports TCAP state modules;
- Phase 2 exposes no TCAP fund-moving instruction.

Phase 3 must add program-test adversarial cases showing legacy escrow, reimbursement, Cranker vault and liquidity instructions reject TCAP vault accounts and that only TCAP CPI with its canonical signer seeds can debit a TCAP reserve.

## Relocation sequence

1. Relocate all TCAP-owned layouts to the independent crate. **Completed in Phase 2.**
2. Keep shared SDK contracts independent. **Completed in Phase 2.**
3. Define TSN-only V2 accounts in the TSN program without importing TCAP account ownership. 
4. Add TCAP initialization instructions and canonical PDA constraints without deposits.
5. Add TSN-to-TCAP CPI interface and configured TSN authorization domain.
6. Select and implement the audited proof verifier.
7. Add atomic payer funding spanning TCAP principal and TSN fee instructions.
8. Add public redemption/confidential output instructions only after adversarial boundary tests pass.
9. Migrate legacy balances and disable legacy creation before removing old code.
