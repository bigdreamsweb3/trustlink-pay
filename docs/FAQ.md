# FAQ

## Is TrustLink Pay a wallet?

No.

TrustLink Pay is a payment experience and protocol stack. Users still control their wallets.

## What is a TIN?

A TIN is a 10-digit Transfer Identity Number.

It is a public payment identity that can be shared instead of a wallet address.

## Does TrustLink Pay hide every transaction?

No.

Solana is public. TrustLink Pay separates sender funding from recipient payout and uses commitments to reduce direct graph exposure. It does not make transactions invisible.

## What is TSN?

TSN is the Transfer Settlement Network.

It handles settlement after a user authorizes payment.

## What is a Cranker?

A Cranker is a settlement operator.

It validates work, executes payouts, and participates in recovery or reimbursement.

## Why use vault liquidity?

Vault liquidity lets recipients be paid quickly.

The protocol later reconciles the vault through commitments and epoch accounting.

## What is an epoch?

An epoch is a settlement window.

It groups payment commitments so accounting and recovery can happen in batches.

## What is a PEA?

A PEA is a per-epoch reservoir.

It isolates funds and accounting for one epoch.

## What happens if settlement fails?

The app should show the real payment state.

Possible states include pending, escrowed, claiming, paid, failed, or canceled. Failed Cranker work should not hide funds that are already escrowed for a recipient.

## Is WhatsApp required?

No.

WhatsApp can help with authentication, notifications, and confidence checks. The core payment identity is the TIN.
