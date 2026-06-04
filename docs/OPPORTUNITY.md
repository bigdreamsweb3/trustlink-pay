# TrustLink Pay Opportunity

TrustLink Pay creates a new payment primitive on Solana:

```text
10-digit identity + private settlement + vault liquidity
```

The product surface is simple: users receive stablecoins through TINs. The settlement surface is powerful: TSN separates sender-side escrow from recipient-side payout.

---

## The Problem

Crypto payments still expose too much.

| Problem | Effect |
| --- | --- |
| Wallet addresses are the payment identity | Users paste unsafe, hard-to-read addresses |
| Wallet graphs are easy to follow | Sender and recipient privacy is weak |
| Wallet UX is not account-number friendly | Mainstream users struggle |
| Settlement infrastructure is fragmented | Apps rebuild the same logic |

TrustLink Pay replaces the user-facing address with a 10-digit TIN and uses TSN to avoid direct wallet-to-wallet payment exposure.

---

## The Opportunity

### For Wallets

Wallets can use TINS as a receive identity layer.

Instead of asking a user to share a wallet address, a wallet can let them share a TIN. The wallet can then route privacy-sensitive payments through TSN.

### For Merchants

Merchants can publish a stable 10-digit receive identity without exposing treasury wallets to every customer.

### For Stablecoin Issuers

Stablecoin issuers can support real payment usage, not just exchange and DeFi volume.

### For Liquidity Providers

LPs can fund TSN vaults and earn from real settlement volume.

### For Cranker Operators

Operators can run settlement infrastructure, verify work, sponsor escrow, execute payout, and earn from protocol activity.

---

## Why TINS Matters

TINS gives TrustLink a clear edge:

- account-number-style payment UX,
- wallet-address abstraction,
- developer-accessible identity resolution,
- future support for social/business identity links,
- compatibility with wallets and payment applications.

The system is not limited to TrustLink Pay. TINS can become a shared identity layer for Solana payments.

---

## Why TSN Matters

TIN identity alone is not enough. If a TIN resolves directly to a wallet and payment happens normally, wallet privacy is still weak.

TSN adds the private settlement path:

```text
sender authorization -> cranker escrow -> vault payout -> proof
```

This makes payment history harder to follow from ordinary wallet views and keeps the recipient wallet out of the sender-facing payment path.

---

## Fee Model

Current settlement-fee split:

| Recipient | Share | Purpose |
| --- | ---: | --- |
| Liquidity Providers | 87% | Rewards vault capital |
| TSN Protocol Treasury | 8% | Supports operations, audits, and reserves |
| Cranker/Operator | 5% | Rewards verification and execution |

Revenue is tied to real settlement activity, not token emissions.

---

## Strategic Position

TrustLink Pay is built by an independent builder on Solana. Support, grants, partnerships, and ecosystem visibility matter because this protocol is infrastructure-heavy and security-sensitive.

The goal is to prove a working payment rail first:

1. TIN-first identity.
2. Private TSN settlement.
3. Cranker execution.
4. Vault liquidity.
5. Developer SDK access.
6. Wallet and merchant integrations.

Social identity and phone-number linking can expand later, after the protocol rail is established.
