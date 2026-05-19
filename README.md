# TrustLink Pay

> Blockchain payments as familiar as mobile money. Privacy built into settlement. Open infrastructure anyone can build on.

## Quick Links

| I want to... | Go to... |
|---|---|
| **Understand the project** | [#about](#trustlink-pay) |
| **Learn the tech** | [Architecture](#project-architecture) |
| **Run locally** | [Quick Start](#quick-start) |
| **Deploy to prod** | [Deployment](#deployment) |
| **Build on TrustLink** | [For Developers](#for-developers) |
| **Integrate TINS** | [TINS Integration](#tins-integration) |
| **Become a Cranker** | [Cranker Operations](#cranker-operations) |
| **Read the code** | [Repository Structure](#repository-structure) |
| **Contribute** | [Contributing](#contributing) |
| **See economics** | [Economics](#the-economics-of-tsn) |

---

The world already knows how to pay with a phone number. Nigeria uses OPay. India uses UPI. Brazil uses Pix. Billions of transactions happen every day through these systems because they solved the one thing crypto has not: **identity-first payments**.

TrustLink Pay brings that identity-first experience to Solana payments. Users send approved stablecoins, and over time approved SPL assets, to a human identity instead of a wallet address. TrustLink starts with phone-number identity, expands toward a permanent on-chain Transfer Identity Number System (TINS), and settles through the Transfer Settlement Network (TSN), a Cranker-powered liquidity network where operators execute payments and liquidity providers earn from real settlement volume.

## TSN Privacy Guarantee

TSN is a privacy-preserving transfer settlement layer.

It avoids direct wallet-to-wallet settlement exposure by splitting payment into private stages:

1. sender-side escrow lock
2. private recipient claim flow
3. Cranker-executed payout path
4. epoch reimbursement path

Result:

- sender does not need recipient wallet visibility
- recipient does not need sender wallet visibility
- settlement remains verifiable through proof and deterministic protocol state

---

## Project Architecture

TrustLink Pay is built as three connected layers: the dApp, the TSN settlement protocol, and the TINS identity protocol.

### Layer One - TrustLink Pay Today

When a user registers, TrustLink verifies their phone number and stores a mapping in its backend: this phone identity belongs to this user. When a sender enters a recipient phone number, TrustLink resolves the identity and prepares the payment route.

WhatsApp is used for authentication, consent, and payment notifications. TrustLink Pay is still a dApp: wallet signing, escrow creation, settlement state, and protocol accounting happen through the TrustLink Pay application and Solana programs.

The identity map is in TrustLink's backend. The money is not. Funds move into Solana escrow, and release or reimbursement depends on program rules, TSN settlement state, and valid proof. The sender does not need to know the recipient wallet. The recipient does not need to know the sender wallet.

### Layer Two - TSN: Transfer Settlement Network

TSN is the protocol layer that handles payment intent creation, claim requests, Cranker execution, proof submission, and epoch reimbursement.

TrustLink Pay resolves the user-facing identity, then routes the payment through TSN. TSN owns the send and claim logic that matters for settlement:

1. A sender creates a payment intent.
2. Funds lock into escrow.
3. A recipient claim request is recorded.
4. A Cranker acquires the execution lease.
5. The Cranker pays the recipient from vault liquidity.
6. The Cranker submits Proof of Payment.
7. Mother Escrow reimburses the Cranker at epoch settlement.

This breaks the direct link between sender wallet and recipient wallet. The sender-side escrow transaction and recipient-side payout are separated by Cranker liquidity and proof-based reimbursement.

### Secure Mempool Payment Intent Processing

TSN uses a mempool-first payment-intent path for secure settlement execution. Payment intents are first published to TSN Mempool. A registered Cranker then submits the on-chain payment-intent transaction.

How it works:

- payment services publish payment intents to TSN Mempool before any on-chain intent is created
- only a registered Cranker can submit or create a TSN payment intent on-chain
- a global `verifier_pda` holds protocol SOL for settlement infrastructure
- the verifier PDA funds account setup for the on-chain payment-intent path
- the Cranker pays transaction gas as the `feePayer`
- the verifier PDA reimburses Cranker gas in the same transaction
- the Cranker receives claim credit instead of an immediate profit premium or execution tip
- one earned claim credit is required to claim and process a profitable claim intent

This keeps the system in a 1:1 utility balance: Crankers are kept close to gas-neutral for useful payment-intent work, but they earn claim eligibility instead of extracting an immediate on-chain premium.

### Layer Three - TINS: Transfer Identity Number System

TINS moves identity routing fully on-chain.

Under TINS, every user owns a permanent 10-digit Transfer Identity Number as a Solana PDA. No database. No backend required. Any Solana developer can resolve a TIN, create a TSN payment intent, and route funds without depending on TrustLink's private infrastructure.

TrustLink Pay's long-term role in the TINS ecosystem is to bridge social identity to on-chain identity. A phone number, X account, business identity, or other verified social signal can point to the same permanent TIN. The TIN becomes the identity primitive. The social layer becomes the trust signal.

This matters because the biggest risk in crypto payments is not only blockchain complexity. It is trust. When a sender in Lagos wants to pay a merchant in London, they need to know the identity they entered resolves to the right person. TINS makes that routing verifiable and portable across Solana applications.

---

## Who Builds on TrustLink, TSN, and TINS

**Users sending money home.** Remittances across Africa, Asia, and Latin America are still expensive and slow. TrustLink targets fast, low-friction transfers where the recipient can be reached through a familiar identity.

**Merchants accepting digital payments.** Small businesses can receive stablecoin payments without exposing wallet addresses to every customer. The customer pays an identity; settlement routes through TSN.

**Developers building payment infrastructure.** With TINS, any Solana developer can resolve a transfer identity and create a TSN payment intent. They do not need TrustLink's database or permission to build on the identity layer.

**Operators running settlement infrastructure.** Cranker operators provide uptime, monitor payment intents and claim requests, execute payouts, submit proof, and earn settlement rewards.

**Liquidity providers funding settlement.** LPs fund TSN vaults. Their capital makes instant settlement possible and earns a majority share of settlement fees generated by real payment volume.

---

## The Economics of TSN

TSN has two fee moments: sender-side fee and claim-side fee. Both are transparent and tied to settlement.

### At Send Time

The sender sees the transfer amount, the current Solana network fee estimate, and the TSN sender fee before confirming.

The verifier wallet pays recoverable protocol account setup for send transactions. Recoverable account rent is infrastructure funding and is not presented as sender network fee. If the verifier wallet does not have enough SOL to create the protocol accounts, the backend rejects payment preparation before the sender signs.

### At Claim Time

The recipient-side settlement may include a claim fee. This fee is part of the TSN settlement economy because the Cranker pays the recipient from vault liquidity, submits proof, and waits for epoch reimbursement.

If settlement creates an unrecoverable recipient token account, that cost belongs on the claim side because the account stays with the recipient after settlement.

### Current Settlement Fee Split

The current TSN default split prioritizes LPs while keeping operators and protocol operations funded.

| Recipient | Share | Purpose |
| --- | ---: | --- |
| Liquidity providers | 87% | Rewards vault capital that makes settlement possible |
| TSN protocol treasury | 8% | Supports protocol development, audits, operations, and security reserves |
| Cranker/operator | 5% | Covers uptime, intent monitoring, execution, proof submission, and operational cost |

This split applies to modeled TSN settlement-fee revenue. The frontend yield calculator separates gross settlement fee revenue from LP-facing APY so depositors can see what they actually earn.

### What a Cranker Operator Earns

Cranker operators are execution providers. They watch TSN for claimable work, acquire leases, pay recipients from vault liquidity, submit proof, and maintain reliable uptime.

Operators earn the operator share of settlement fees. The operator percentage is intentionally smaller than LP share because liquidity providers supply the capital that makes settlement possible. The operator allocation is designed to remain operational-cost-aware rather than dominate the settlement economy.

### What a Liquidity Provider Earns

LPs fund the vaults that Crankers use to pay recipients. Each funder has a verifiable liquidity position, and LP earnings are based on the vault's actual settled volume.

LPs do not earn the whole gross TSN fee stream. They earn the LP share. This is important for transparency: if a vault generates settlement fees, the calculator separates LP income, operator income, and protocol treasury income instead of presenting gross protocol yield as LP APY.

Vault capacity matters:

- a vault receives only its share of total active TSN liquidity
- a vault cannot settle more than its liquidity can support between reimbursement epochs
- if a vault runs out of capital, it waits for epoch reimbursement before claiming more work
- current epoch modeling uses a 7-hour reimbursement cycle

---

## Privacy in Settlement

### What Is Public

TSN can make the following settlement facts visible:

- that a payment intent existed
- that a claim request entered the settlement flow
- which Cranker acquired the execution lease
- that proof was submitted
- that reimbursement moved through epoch settlement

The public record does not need to expose the sender wallet to the recipient or the recipient wallet to the sender.

### What Is Private

The recipient's wallet, payment identity, and detailed settlement record are handled through controlled application state and Cranker audit records. TSN is designed so normal users experience private settlement without needing to understand wallet routing.

The privacy goal is simple: the sender should not be able to track the recipient wallet, and the recipient should not learn the sender wallet just because a payment happened.

### Compliance Position

TSN is privacy-preserving, not accountability-free. A Cranker can maintain an encrypted audit trail for the settlements it executed. The blockchain proves which operator processed a payment; the operator can produce required records under the appropriate legal process.

---

## The Path to Full Decentralisation

| Now | With TINS | With mature TSN |
| --- | --- | --- |
| Identity routing through TrustLink backend | Identity routing through TIN PDAs | Any app resolves TINs directly |
| TrustLink prepares user-facing payments | TSN owns payment intent and claim routing | Multiple apps create TSN intents |
| Local/operator-controlled Cranker runtime | Open Cranker SDK | Competitive Cranker network |
| Phone identity first | Phone, TIN, and social identity links | Independent identity providers can build on TINS |
| Escrow-backed settlement | Proof-based reimbursement | Liquid, multi-operator settlement marketplace |

The product proves the UX. TSN makes settlement private and liquid. TINS makes identity portable and open.

---

## How It Works

### Send Flow

1. Sender logs in and enters a recipient phone number or supported identity.
2. TrustLink resolves the identity and prepares a TSN payment intent.
3. Sender reviews the transfer amount, Solana network estimate, and TSN sender fee.
4. Sender signs once in their wallet.
5. Funds lock into a unique escrow vault PDA.
6. TSN records the payment intent for settlement.
7. Recipient receives a notification or invite path.

### Claim Flow - TSN

1. Recipient opens TrustLink and starts the claim path.
2. TSN records a claim request for the payment intent.
3. A Cranker detects the matching intent and claim request.
4. The Cranker acquires the execution lease.
5. The Cranker pays the recipient from vault liquidity.
6. The Cranker submits Proof of Payment.
7. Mother Escrow reimburses the Cranker at the next epoch.
8. Settlement fees are distributed according to the active TSN split.

### Legacy Claim Flow - Direct Release

Before TSN, recipients claimed by connecting a wallet, signing a release transaction, and receiving funds directly from escrow. This path still exists for compatibility and recovery, but it does not provide the same settlement privacy because the escrow release can directly link escrow state to a recipient wallet.

---

## Security Model

| Guarantee | How it works |
| --- | --- |
| Noncustodial escrow | Funds lock into Solana escrow accounts governed by program rules |
| Per-payment isolation | Each payment has its own payment PDA and escrow vault |
| Address-poisoning resistance | Sender pays an identity, not a pasted wallet address |
| Sender privacy | Recipient does not need the sender wallet |
| Recipient privacy | Sender does not need the recipient wallet |
| Cranker exclusivity | One Cranker holds an execution lease for a payment at a time |
| Proof-based reimbursement | Cranker recovery depends on valid proof submission |
| LP accounting | Liquidity positions track funded vault capital |
| Operational funding checks | Verifier SOL balance is checked before send transaction preparation |
| Registered Cranker intent submission | Only registered Crankers can create TSN payment intents on-chain |
| Verifier-funded account setup | Verifier PDA funds payment-intent account setup |
| Gas-neutral Cranker execution | Verifier PDA reimburses Cranker gas without adding a profit premium |
| 1:1 Cranker claim credit | Crankers earn claim eligibility instead of execution tips |

---

## Current Status

**Live in the product path:**

- WhatsApp session authentication
- Phone-number identity routing through TrustLink backend
- PIN-gated app access
- Approved token selection from connected Solana wallets
- Sender fee and network fee review
- Per-payment Solana escrow creation
- WhatsApp notification and manual invite flows
- Viewer-safe transaction detail views
- TSN payment-intent creation after escrow lock
- Landing page with TSN fee and LP yield calculator
- Operator dashboard shell
- WhatsApp SDK modal UI

**Protocol and settlement work:**

- Escrow v3 program support
- TSN Mother Escrow and Cranker PDA modules
- Intent state machine and lease claiming
- Proof of Payment path
- Mempool-first payment-intent processing with registered Cranker submission and claim-credit eligibility
- Cranker vault and liquidity position scaffolding
- Local Cranker daemon and setup scripts
- Settlement fee split defaults: 87% LP, 8% treasury, 5% operator
- 7-hour epoch reimbursement architecture

**In active development:**

- TINS on-chain identity registry
- mature multi-operator Cranker network
- production epoch reimbursement and distribution automation
- permanent settlement archival
- expanded approved asset support beyond initial stablecoins

---

## Milestones

### Milestone 1 - StableHacks 2026

[StableHacks 2026](https://dorahacks.io/hackathon/stablehacks/detail) - Organised by [Tenity](https://dorahacks.io/org/14594/hackathon) - **Track:** Programmable Stablecoin Payments

Proved the end-to-end product path: phone-verified identity, escrow-backed payments, gasless UX design, and hardened escrow architecture.

### Milestone 2 - The Bags Hackathon

[The Bags Hackathon](https://dorahacks.io/hackathon/the-bags-hackathon/detail) - **Track:** Payments

Extended the TrustLink payment model toward approved SPL asset transfers through identity-first routing. This supports the broader direction of sending more than one stablecoin type as the allowlist expands.

### Milestone 3 - TINS Protocol

Active development. Moves identity routing from TrustLink's backend to a permanent on-chain registry.

[TINS Overview](transfer-identity-number-system-(TINS)/README.md)

### Milestone 4 - TSN Settlement Network

Scaffolded and devnet-oriented. Covers Cranker execution, Proof of Payment, vault liquidity, encrypted audit record design, and epoch reimbursement architecture.

---

## TINS Production Ready ✅

TINS is now **live and production-ready**:

- **10-digit identity numbers** (like bank account numbers)
- **Main wallet NEVER on-chain** (privacy first)
- **Multi-sig wallet rotation** (2/3 recovery wallets)
- **Anti-enumeration protection** (HMAC-based TIN generation)
- **Team fees** (prevents abuse)

### Security Features Implemented

| Feature | Status |
|---------|--------|
| Main wallet off-chain | ✅ Implemented |
| Privacy key derived (BIP-44) | ✅ Implemented |
| Display name verification | ✅ Implemented |
| Anti-enumeration TINs | ✅ Implemented |
| Multi-sig recovery (2/3) | ✅ Implemented |
| 24hr rotation cooldown | ✅ Implemented |
| Rate limiting | ✅ Implemented |
| Team fees | ✅ Implemented |

### Fees (All to Team Treasury)

| Action | Fee |
|--------|-----|
| Create TIN | 0.01 SOL |
| Rotate wallet | 0.005 SOL |
| Add recovery | 0.002 SOL |

---

## Repository Structure

| Path | Description |
| --- | --- |
| `frontend` | Next.js dApp, landing page, send flow, claim flow, dashboard, and TrustLink UI |
| `backend` | API routes, identity services, payment orchestration, database layer, and Solana integration |
| `tsn-mempool-backend` | Python mempool server - submodule of [tsn-mempool-backend](https://github.com/bigdreamsweb3/tsn-mempool-backend) |
| `tsn-mempool-frontend` | Next.js mempool explorer UI - submodule of [tsn-mempool-frontend](https://github.com/bigdreamsweb3/tsn-mempool-frontend) |
| `tsn/protocol/programs/trustlink-escrow` | Anchor escrow program with escrow and TSN modules |
| `tsn` | TSN contracts, settlement economics, Cranker daemon, and setup scripts |
| `trustlink-whatsapp-sdk` | WhatsApp authentication UI and handoff helpers |
| `docs` | Architecture notes, service boundaries, wallet roles, and devnet testing guides |
| `transfer-identity-number-system-(TINS)` | TINS on-chain identity program - **PRODUCTION READY** ✅ |

## Quick Start

```bash
cd backend && npm install && tsx scripts/init-db.ts && npm run dev
cd frontend && npm install && npm run dev
```

---

**TrustLink Pay** - identity-first payments on Solana, settling through TSN with privacy, liquidity-backed execution, and open protocol infrastructure that developers can build on.
