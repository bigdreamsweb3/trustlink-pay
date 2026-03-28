# TrustLink Escrow V2 Design

This document defines the next TrustLink escrow model after the current Solana-only implementation.

The goals are:

- keep per-payment privacy isolation
- make sender-side transactions cheaper and easier to complete
- let TrustLink sponsor Solana fees for both send and claim
- recover sponsored costs fairly without silently reducing sent amounts
- move expired payments into TrustLink-controlled recovery wallets
- keep post-expiry recovery outside the escrow contract for now

## Design Decisions

### 1. Keep per-payment vaults

TrustLink will keep the current privacy-friendly model:

- one payment account per payment
- one escrow vault token account per payment

We are **not** switching to reusable sender-token vaults.

Reason:

- reusable vaults make sender activity easier to correlate over time
- per-payment vaults are safer for privacy
- closing an empty per-payment vault returns rent to TrustLink anyway

### 2. TrustLink sponsors send and claim SOL fees

TrustLink will sponsor:

- sender-side Solana transaction fee
- claimer-side Solana transaction fee
- per-payment account and vault rent/setup

This means users do not need SOL to send or claim in the sponsored flow.

### 3. Sender fee is added on top, not deducted

If a sender wants to send `X` tokens, the receiver-facing payment amount remains `X`.

Sender pays:

- `send_amount`
- `+ sender_fee`

Example:

- sender wants to send `5.00 USDC`
- sender fee is `0.01 USDC`
- total required from sender wallet is `5.01 USDC`

The receiver-side payment should still be based on `5.00 USDC`, not `4.99 USDC`.

### 4. Sender fee excludes recoverable rent/setup

Sender fee must only include:

- current Solana network transaction fee
- TrustLink sender-side markup

Sender fee must **not** include:

- payment account rent
- escrow vault token-account rent
- other setup rent that TrustLink can recover later when accounts close

Reason:

- those setup costs are recoverable by TrustLink on claim or expiry
- charging them to the sender up front would overcharge the sender

### 5. Claim fee is deducted from payout

Claim fee remains a payout deduction.

Claim fee can include:

- current Solana claim transaction fee
- ATA creation cost when needed
- TrustLink claim-side markup

Reason:

- receiver may need a token account created at claim time
- this cost is tied to the actual claim transaction and selected destination wallet

### 6. Expired payments move to recovery wallets

When a payment expires:

- escrow vault is closed
- rent/setup SOL returns to TrustLink fee payer/verifier
- token balance is transferred to a TrustLink recovery wallet
- payment is marked as expired-to-pool

This movement happens by backend-triggered expiry execution, not by automatic blockchain timing.

### 7. Recovery wallets are a rotating wallet set

Expired funds should not all go to one permanent recovery wallet.

TrustLink maintains a configurable list of recovery wallets.

On expiry, the backend chooses one active recovery wallet from the configured list.

Recommended first implementation:

- round-robin selection

Later options:

- random selection
- weighted selection
- risk-based wallet rotation

### 8. Post-expiry recovery stays off-contract for now

Once funds are moved to a TrustLink recovery wallet:

- sender-side recovery
- receiver-side late claim
- extra late-recovery fees

will be handled by a separate operational flow, not by the escrow contract.

This keeps the contract smaller and simpler for now.

## Fee Model

TrustLink now has three fee categories.

### Sender fee

Purpose:

- reimburse TrustLink for sponsoring send-time network fee

Formula:

- `sender_fee = current_send_network_fee_in_token + sender_markup`

Notes:

- excludes recoverable setup rent
- charged on top of send amount

### Claim fee

Purpose:

- reimburse TrustLink for sponsoring claim-time network fee
- cover claim-side ATA creation if needed

Formula:

- `claim_fee = (claim_network_fee + claim_setup_cost_if_needed) converted to token + claim_markup`

Notes:

- deducted from payout
- depends on the actual selected wallet and claim transaction shape

### Recovery fee

Purpose:

- charge for late/manual recovery after expiry

Formula:

- determined later in the off-contract recovery system

It may include:

- transfer cost out of recovery wallet
- late handling penalty
- operational margin

## Markup Policy

TrustLink should use the same markup policy family for send and claim.

Recommended config:

- `send_fee_bps`
- `claim_fee_bps`
- `recovery_fee_bps`
- `send_fee_cap_ui_amount`
- `claim_fee_cap_ui_amount`

This gives flexibility while keeping a consistent fee philosophy.

If product wants the same markup for send and claim, both can point to the same configured value.

## Expiry Model

Expiry must be system-configured.

TrustLink should set the expiry duration when the payment is created.

Examples:

- 24 hours
- 2 days
- 7 days
- 30 days

Recommended config field:

- `default_expiry_seconds`

Later we can support per-payment overrides, but system-defined expiry is the right first version.

## On-Chain State Changes

### EscrowConfig

Current config already includes verifier/treasury/fee fields.

Escrow V2 should add:

- `default_expiry_seconds: i64`

Optional future additions:

- `send_fee_bps: u16`
- `claim_fee_bps: u16`
- `send_fee_cap: u64`
- `claim_fee_cap: u64`

### PaymentAccount

Current payment account should evolve to include:

- `payment_id`
- `sender_pubkey`
- `receiver_phone_hash`
- `token_mint`
- `amount`
- `send_fee_amount`
- `claim_fee_amount`
- `expiry_ts`
- `status`
- `payment_bump`
- `vault_authority_bump`

Reason:

- send fee and claim fee are different concepts
- they happen at different times
- they should be tracked independently

### PaymentStatus

Current:

- `Pending`
- `Claimed`
- `Refunded`

Add:

- `ExpiredToPool`

This marks that:

- the payment is no longer in escrow
- the funds were moved to a TrustLink recovery wallet

## On-Chain Instructions

### Keep

- `initialize_config`
- `update_config`
- `create_payment`
- `claim_payment`
- `refund_payment`

### Add

- `expire_payment_to_pool`

This instruction should:

- require payment is pending
- require payment has expired
- move token balance from escrow vault to selected recovery wallet token account
- close vault
- return vault rent to TrustLink payer/verifier
- mark payment status `ExpiredToPool`

## Backend Responsibilities

The backend will handle:

- sender fee estimation
- claim fee estimation
- expiry scanning
- choosing the recovery wallet
- executing expiry transactions
- later recovery workflows outside the contract

### New backend config

Add config for:

- `TRUSTLINK_DEFAULT_EXPIRY_SECONDS`
- `TRUSTLINK_SEND_FEE_BPS`
- `TRUSTLINK_SEND_FEE_MAX_UI_AMOUNT`
- `TRUSTLINK_CLAIM_FEE_BPS`
- `TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT`
- `TRUSTLINK_RECOVERY_WALLETS`

Example:

```json
[
  {"address":"WalletA","label":"pool-1","active":true},
  {"address":"WalletB","label":"pool-2","active":true}
]
```

### Expiry executor

The backend needs a recurring job that:

1. finds pending payments where `expiry_ts < now`
2. picks a recovery wallet from the active set
3. submits `expire_payment_to_pool`
4. records which recovery wallet received the funds

## Frontend Responsibilities

### Send

Before sender confirms:

- show entered send amount
- show sender fee
- show total token required
- show sponsored Solana network fee explanation

If sender balance is not enough for:

- `amount + sender_fee`

then sending should be blocked.

### Claim

Before claimer confirms:

- show gross amount
- show claim fee
- show amount to wallet
- show live estimate based on chosen wallet

## Database Additions

Recommended payment fields:

- `send_fee_amount`
- `claim_fee_amount`
- `expired_to_pool_at`
- `recovery_wallet_address`
- `expiry_ts`

These fields help the backend and admin tools understand:

- what was charged at send
- what was charged at claim
- whether expiry happened
- where expired funds were routed

## Rollout Plan

### Phase 1

- add configurable expiry duration
- add `ExpiredToPool`
- add rotating recovery wallet set
- add `expire_payment_to_pool`
- add backend expiry executor

### Phase 3

- TrustLink sponsors send fees
- sender fee added on top of send amount
- sender fee based only on network fee, not rent/setup

### Deferred

- post-expiry recovery flow
- sender cancellation from recovery wallet
- receiver late-claim from recovery wallet

These should be designed outside the escrow contract later.

## Recommended Immediate Build Order

1. update payment model to split `send_fee_amount` and `claim_fee_amount`
2. add `default_expiry_seconds` to config
3. add `ExpiredToPool` status
4. add `expire_payment_to_pool` instruction
5. add backend recovery-wallet rotation config
6. add backend expiry executor
7. update send flow to sponsored-fee model
8. update UI to show sender fee on top of send amount

