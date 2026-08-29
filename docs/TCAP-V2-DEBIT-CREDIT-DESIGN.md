# TCAP V2 debit and GPRU-to-GPRU credit design

This document defines the next V2 custody path for TrustLink Pay. It is a design and implementation boundary; it does not claim that debit, transfer, or wallet exit is deployed.

## Scope and invariants

GPRU identifies ownership and authorization. TCAP owns custody, asset reserves, confidential-liability accounting, and opaque tip state. ZK-PRU, payment-intent PDAs, AcceptedIntent, epoch, receipt, route, and public per-transfer join accounts are outside this path.

The existing `deposit_asset_v2` transaction moves tokens from a depositor token account into the governed TCAP vault and increases reserve `actual_assets`. The existing `credit_tcap_tin_tip_v2` transaction advances an opaque tip commitment only; it does not move tokens or create a spendable balance. A debit implementation must therefore add an explicit liability ledger before it can be enabled.

## Proposed instruction: `debit_tcap_gpru_tip_v2`

The debit instruction consumes an authorized source-tip transition and creates a destination-credit authorization. It must atomically:

1. verify the source tip's previous commitment, next sequence, policy commitment, and non-repeated nullifier;
2. verify `amount > 0`, the asset entry is active, and the token identifier matches the governed asset;
3. bind the amount, token identifier, source tip, destination tip commitment, sequence, validity window, policy commitment, GPRU scope commitment, and nullifier into a domain-separated authorization digest;
4. verify the TSN authorization signer derived from that digest;
5. check `settled_confidential_liabilities + amount <= actual_assets` and update the confidential-liability counters atomically;
6. advance the source tip commitment and sequence without storing a TIN, route, wallet, or recipient identifier;
7. emit only an opaque transition digest, never the source or destination TIN.

The destination side is represented by a separate `credit_tcap_tin_tip_v2` transition using a fresh authorization digest. The debit and credit must not share a public per-transfer account or include the funding transaction's token accounts.

## Authorization binding

The digest domain must be distinct from the existing credit domain, for example `TSN_GPRU_TCAP_DEBIT_V2`, and include:

```text
source_tip PDA
destination_tip commitment (not a destination TIN)
amount
token_id
source previous commitment
source new commitment
source sequence
policy commitment
GPRU scope commitment
nullifier
valid-after slot
expiry slot
```

The TSN wrapper must derive its signer PDA from this digest and CPI into TCAP. No client-controlled signer may authorize a debit. The destination credit must use a separate digest and sequence, so replaying a debit authorization cannot mint another credit.

## Accounts allowed on each transaction

### Debit transaction

Only these accounts are allowed:

- TSN authority signer and TSN mother escrow;
- TSN and TCAP executable accounts;
- TCAP global config;
- the governed asset entry and reserve state;
- opaque source tip root and source tip PDA;
- an opaque authorization signer PDA;
- the system program, if an authorization state account is required.

The debit transaction must not include a source token account, governed vault token account, destination tip PDA, TIN account, route account, payment-intent account, epoch account, receipt, nullifier PDA, commitment-root PDA, or ZK-PRU account. A nullifier is data in the authorization and tip state, not a public nullifier account.

### Credit transaction

The current V2 credit allowlist remains the model:

- TSN authority signer and mother escrow;
- TSN and TCAP executable accounts;
- TCAP global config and governed asset entry;
- opaque destination tip root and destination tip PDA;
- opaque authorization signer PDA;
- system program where required.

Funding bookkeeping accounts and all debit-side accounts must be absent. The existing runner's `fundingAccountsInCredit: []` check should become a required regression test for both debit and credit.

## Unlinkability from funding

Funding is intentionally public: observers can see the depositor token account, mint, amount, and governed vault. Debit and credit must be separate opaque state transitions. Neither transaction may carry the funding signature, funding token account, vault token account, source TIN, destination TIN, or a shared transfer PDA. The only common protocol-level relationship is an authorization that the TSN and TCAP programs can verify; it must not be a publicly joinable account.

This provides unlinkability from the funding transaction at the account and instruction layer. It does not make a public wallet exit invisible: an exit necessarily reveals its destination wallet, mint, and amount. The exit can remain unlinkable to a TIN only if it uses a separately authorized opaque liability release and never includes TIN or funding accounts.

## Custody and liability model

`actual_assets` is the token amount physically held by the governed vault. `settled_confidential_liabilities` (or a dedicated V2 liability counter) is the amount already credited to private ownership. A debit must reject when the resulting liability would exceed `actual_assets`; a later exit must decrement the liability and vault balance atomically. The current V2 credit instruction does not update this liability and therefore cannot be treated as a payment credit until the debit/liability instruction exists.

## Implementation plan

1. Add a V2 liability representation and conservation helpers to TCAP state, with unit tests for underflow, overflow, wrong asset, stale sequence, replayed nullifier, expired authorization, and reserve insolvency.
2. Add `debit_tcap_gpru_tip_v2` to TCAP. Keep the existing V1 debit and exit handlers fail-closed and unused.
3. Add `tsn_register_tcap_debit_authorization_v2` to TSN with a CPI account allowlist matching this document.
4. Add a runner scenario that performs funding, debit authorization, and destination credit. It must inspect every transaction and fail on forbidden accounts/instructions.
5. Add tests proving funding accounts are absent from debit and credit transactions and that replaying either authorization fails.
6. Only after debit and credit compile and pass Devnet tests should a separate wallet-exit V2 instruction be designed. No live exit is part of this milestone.

## Current blockers

- No V2 debit instruction exists in the deployed source.
- `TCapTinTipV1` has no spendable amount; commitment advancement alone cannot debit funds.
- TCAP reserve liability fields exist, but no V2 instruction currently binds them to an opaque source-tip debit.
- The existing V1 debit and exit paths are proof-gated and must not be promoted to the final architecture.
- A V2 runner for debit plus destination credit does not yet exist.

The next implementation command, after reviewing this specification, is:

```bash
npm run tcap:program:build:devnet
```

That command is only a compile baseline. No deployment or live exit is authorized by this document.
