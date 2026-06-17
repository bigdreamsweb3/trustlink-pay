# TrustLink Pay Opportunity

TrustLink Pay creates a new payment primitive on Solana:

```
10-digit identity + private settlement + vault liquidity
```

Users receive stablecoins through 10-digit TINs. TSN separates sender-side escrow from recipient-side payout so a payment does not look like a direct wallet-to-wallet transfer.

---

## The Problem

Crypto payments expose too much information on-chain.

| Problem | Effect |
| --- | --- |
| Wallet addresses are the payment identity | Users paste unsafe, hard-to-read addresses |
| Wallet graphs are easy to follow | Sender and recipient privacy is weak |
| Wallet UX is not account-number friendly | Mainstream users struggle |
| Settlement infrastructure is fragmented | Apps rebuild the same logic |

TrustLink Pay replaces the user-facing address with a TIN and routes settlement through TSN to break the direct wallet-to-wallet link.

---

## The Opportunity: TINS

TINS gives users a permanent 10-digit payment identity they can share instead of a wallet address.

This matters because:

- Account-number-style UX is familiar to mainstream users
- Wallet address abstraction protects against address poisoning
- Developers get a standard identity resolution layer
- Merchants can publish a stable receive identity without exposing treasury wallets

TINS is not limited to TrustLink Pay. It can serve as a shared identity layer for any Solana payment application.

---

## The Opportunity: TSN

TIN identity alone is not enough. If a TIN resolves directly to a wallet and payment happens normally, wallet privacy is still weak.

TSN adds the private settlement path:

```
sender authorization -> cranker escrow -> vault payout -> proof
```

This makes payment history harder to follow from ordinary wallet views and keeps the recipient wallet out of the sender-facing payment path.

---

## Fee Model

Settlement fees are split by the protocol:

| Recipient | Share | Purpose |
| --- | ---: | --- |
| Liquidity Providers | 87% | Rewards vault capital |
| TSN Protocol Treasury | 8% | Operations, audits, reserves |
| Cranker/Operator | 5% | Verification and execution |

Revenue is tied to real settlement activity, not token emissions.

---

## Current Focus

The immediate goal is to prove the core payment rail:

1. TIN-first identity
2. Private TSN settlement
3. Cranker execution
4. Vault liquidity
5. Developer SDK access

Social identity linking and phone-number discovery can follow after the protocol rail is established.
