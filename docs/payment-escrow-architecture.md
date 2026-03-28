# TrustLink Escrow And Payment Architecture

This document explains how TrustLink moves funds through Solana, how fees are handled, and how the verifier, treasury, and expiry flow work together.

## Core Escrow Model

TrustLink uses a **per-payment escrow** model.

For each payment:
- a unique on-chain payment account is created
- a unique escrow vault token account is created
- the selected SPL token amount is moved into that vault

TrustLink keeps vaults per payment instead of reusing one sender vault across many payments. This costs more than a pooled model, but it is much better for privacy because payments are harder to correlate over time.

## Main Roles

### Sender

The sender:
- chooses a WhatsApp number
- chooses a supported token
- enters an amount
- signs the token movement with their wallet

### Receiver

The receiver:
- signs in with the matching phone number
- passes OTP verification
- selects a payout wallet
- claims the escrowed funds

### Claim Verifier

TrustLink runs a backend-controlled verifier wallet.

The verifier:
- initializes and updates the escrow config
- pays Solana network fees for sponsored send
- pays Solana network fees for claim
- signs claim transactions
- receives recovered SOL rent when escrow vaults and terminal payment PDAs are closed

This is configured by:
- `SOLANA_CLAIM_VERIFIER_SECRET_KEY`

### Treasury Owner

TrustLink uses a treasury owner wallet for token-denominated fees.

Treasury token accounts receive:
- sender-side token fees
- claim-side token fees

This is configured by:
- `TRUSTLINK_TREASURY_OWNER`

### Recovery Wallets

TrustLink maintains one or more recovery wallets for expired payments.

Expired payments are swept into one of these wallets instead of a single permanent pool wallet.

This is configured by:
- `TRUSTLINK_RECOVERY_WALLETS`

## Send Flow

### 1. Recipient verification

Before a payment is prepared, TrustLink verifies the recipient's WhatsApp identity state through the app.

### 2. Sender fee estimate

Before signing, TrustLink estimates the sender-side fee.

Sender-side fee includes:
- the current Solana network transaction fee
- TrustLink markup, if configured

Sender-side fee does **not** include:
- payment account rent
- escrow vault rent
- other recoverable setup rent

Those setup costs are fronted by TrustLink because they are recovered later when vaults close and terminal payment PDAs are closed.

### 3. Sender fee is added on top

TrustLink does not silently reduce the sender's intended payment amount.

Example:
- sender wants to send `5.00 USDC`
- sender fee is `0.004 USDC`
- total required is `5.004 USDC`

### 4. Sponsored send

For sponsored send:
- the sender signs as token owner
- the verifier wallet pays the Solana transaction fee
- the verifier also fronts setup rent

### 5. On-chain payment creation

On-chain, the contract:
- transfers the main payment amount into the escrow vault
- transfers the sender fee amount to the treasury token account
- stores payment metadata, including expiry

## Claim Flow

### 1. OTP verification

The receiver proves ownership of the destination phone number with OTP.

### 2. Live claim fee estimate

Before claim, TrustLink estimates the live claim cost based on:
- Solana network fee
- receiver ATA creation, if needed
- treasury ATA creation, if needed
- TrustLink markup

### 3. Claimer does not need SOL

The verifier wallet pays the Solana network fee for claim.

### 4. On-chain claim split

On-chain, the contract:
- sends `amount - claim_fee_amount` to the receiver token account
- sends `claim_fee_amount` to the treasury token account
- closes the escrow vault
- closes the payment PDA
- returns recovered SOL rent to the verifier wallet

## Expiry Flow

TrustLink config stores a default expiry duration:
- `TRUSTLINK_DEFAULT_EXPIRY_SECONDS`

Each payment gets its own expiry timestamp at creation time.

If a payment is still pending after expiry:
- TrustLink sweeps the token balance from the escrow vault to one configured recovery wallet
- the escrow vault is closed
- the payment PDA is closed
- recovered SOL rent returns to the verifier wallet
- the payment is marked expired in TrustLink records

The current manual sweeper entrypoint is:
- `npm run escrow:expire-payments`

## Why Sender Fee Excludes Account Rent

TrustLink does not charge sender-side token fees for setup rent because setup rent is recoverable later.

When the escrow vault and terminal payment PDA close:
- the verifier wallet gets the SOL rent back

So the sender-side fee is meant to reflect only the immediate non-recoverable network cost, plus TrustLink markup.

## Why Claim Fee Is Deducted From Payout

Claim is different because TrustLink completes the release on behalf of the receiver.

So the claim fee is deducted from the payout amount itself. This keeps claim simple because the receiver does not need SOL in their wallet.

## Important Environment Variables

### Blockchain and verifier

- `SOLANA_RPC_URL`
- `SOLANA_PROGRAM_ID`
- `SOLANA_CLAIM_VERIFIER_SECRET_KEY`

### Treasury and fees

- `TRUSTLINK_TREASURY_OWNER`
- `TRUSTLINK_SEND_FEE_BPS`
- `TRUSTLINK_SEND_FEE_MAX_UI_AMOUNT`
- `TRUSTLINK_CLAIM_FEE_BPS`
- `TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT`

### Expiry and recovery

- `TRUSTLINK_DEFAULT_EXPIRY_SECONDS`
- `TRUSTLINK_RECOVERY_WALLETS`

## Operational Summary

- TrustLink keeps per-payment vaults for privacy.
- TrustLink sponsors network fees for send and claim.
- Sender fee is added on top of the sent amount.
- Claim fee is deducted from the claimed payout.
- Recoverable rent is not charged to the sender as a token fee.
- Expired payments move into rotating recovery wallets for manual operational follow-up later.
