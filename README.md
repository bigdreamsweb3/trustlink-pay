# TrustLink Pay

> Identity-first Blockchain payments (as familiar as mobile money) on Solana, with private settlement and open identity infrastructure.

The world already knows how to pay with a phone number. Nigeria uses OPay. India uses UPI. Brazil uses Pix. Billions of transactions happen every day through these systems because they solved the one thing crypto has not: **identity-first payments**.

TrustLink Pay brings that identity-first experience to Solana payments. Users send approved stablecoins to a human identity (phone or TIN) instead of a wallet address. Settlement happens through the Transfer Settlement Network (TSN), where operators ("Crankers") execute payments and liquidity providers earn from real settlement volume.

---

## Supported by

- **[Superteam](https://superteam.fun) Agentic Engineering Grant** (200 USDG) � [acknowledgment](#funding--support)

---

## Crankers & Liquidity Providers

TrustLink Pay uses a specialized Transfer Settlement Network (TSN) to enable fast, private, phone-number-based payments on Solana. Two key roles power this network:

| Role                          | Responsibility                                                   | Earns                  |
| ----------------------------- | ---------------------------------------------------------------- | ---------------------- |
| **Crankers**                  | Execute payments, monitor intents, submit proof, maintain uptime | 5% of settlement fees  |
| **Liquidity Providers (LPs)** | Fund token-specific vaults that crankers draw from               | 87% of settlement fees |

This creates real yield for participants � from actual payment volume, not token emissions.

### Launch Strategy

At launch, **TrustLink Pay will be the first and primary cranker operator**. Running a cranker will not be open to the public initially. This controlled start ensures high reliability, speed, and security while the network proves itself.

**For stablecoin issuers and firms:**

- Fund TSN vaults with your stablecoins
- Earn attractive LP yields (87% fee share) from real payment volume
- Your stablecoin becomes the preferred fast-settlement option for users

**For liquidity providers:**

- Deposit stablecoins into vaults
- Earn passive, real-yield returns backed by payment fees
- No token emissions � yield comes from actual settlement revenue

**For future cranker operators:**

- Run your own verified cranker node once the network opens
- Capture both operator fees (5%) and LP yields
- Support specific tokens with full control

This creates a growth flywheel: **More liquidity ? faster settlements ? more users ? higher volume ? better yields ? more participants.**

**Interested in vault funding or cranker partnerships?** ? [docs/OPPORTUNITY.md](docs/OPPORTUNITY.md)

---

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

## Fraud Protection

TSN Mempool will include fraud detection to secure transfers and protect against malicious activity.

**Key Features:**

- Fraud detection & replay attack prevention
- Anomaly detection & risk scoring
- Cranker jail system for malicious operators
- Settlement protection & proof verification

?? **[docs/AI-PROTECTION.md](docs/AI-PROTECTION.md)** � Full fraud protection documentation

---

## Project Architecture

TrustLink Pay is built as three connected layers: the dApp, the TSN settlement protocol, and the TINS identity protocol.

### 1. Application Layer (TrustLink Pay)

- user onboarding and identity UX
- payment initiation and confirmation flow
- sender and recipient app experience

#### TrustLink Pay Today

When a user registers, TrustLink verifies their phone number and stores a mapping in its backend: this phone identity belongs to this user. When a sender enters a recipient phone number, TrustLink resolves the identity and prepares the payment route.

WhatsApp is used for authentication, consent, and payment notifications. TrustLink Pay is still a dApp: wallet signing, escrow creation, settlement state, and protocol accounting happen through the TrustLink Pay application and Solana programs.

The identity map is in TrustLink's backend. The money is not. Funds move into Solana escrow, and release or reimbursement depends on program rules, TSN settlement state, and valid proof. The sender does not need to know the recipient wallet. The recipient does not need to know the sender wallet.

### 2. Identity Layer (TINS)

- permanent 10-digit transfer identity
- privacy-preserving identity resolution
- on-chain registry portability for external builders

### 3. Settlement Layer (TSN)

- temporary escrow-first routing
- private claim execution path
- cranker-based payout and proof submission
- epoch accounting and settlement distribution

### Secure Mempool Payment Intent Processing

TSN uses a mempool-first payment-intent path for secure settlement execution.

- payment services publish payment intents to TSN Mempool before any on-chain intent is created
- only a registered/verified Cranker can submit or create a TSN payment intent on-chain
- Cranker intent submission is gated by protocol registration and lease/credit rules

## TINS Production Ready ?

TINS is now **live and production-ready**:

- **10-digit identity numbers** (like bank account numbers)
- **Main wallet NEVER on-chain** (privacy first)
- **Multi-sig wallet rotation** (2/3 recovery wallets)
- **Anti-enumeration protection** (HMAC-based TIN generation)
- **Team fees** (prevents abuse)

### Security Features Implemented

| Feature                      | Status        |
| ---------------------------- | ------------- |
| Main wallet off-chain        | ? Implemented |
| Privacy key derived (BIP-44) | ? Implemented |
| Display name verification    | ? Implemented |
| Anti-enumeration TINs        | ? Implemented |
| Multi-sig recovery (2/3)     | ? Implemented |
| 24hr rotation cooldown       | ? Implemented |
| Rate limiting                | ? Implemented |
| Team fees                    | ? Implemented |

### Fees (All to Team Treasury)

| Action        | Fee       |
| ------------- | --------- |
| Create TIN    | 0.01 SOL  |
| Rotate wallet | 0.005 SOL |
| Add recovery  | 0.002 SOL |

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

| Recipient             | Share | Purpose                                                                             |
| --------------------- | ----: | ----------------------------------------------------------------------------------- |
| Liquidity providers   |   87% | Rewards vault capital that makes settlement possible                                |
| TSN protocol treasury |    8% | Supports protocol development, audits, operations, and security reserves            |
| Cranker/operator      |    5% | Covers uptime, intent monitoring, execution, proof submission, and operational cost |

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

## How It Works

### Send Flow - TSN

1. Sender logs in and enters a recipient phone number or supported identity.
2. TrustLink resolves the identity and prepares a TSN payment intent.
3. Sender reviews the transfer amount, Solana network estimate, and TSN sender fee.
4. Sender signs once in their wallet.
5. Funds lock into a unique escrow vault PDA.
6. TrustLink posts the intent to TSN Mempool.
7. A registered Cranker picks the intent, submits the required on-chain TSN transaction(s), and executes payout from vault liquidity.
8. Cranker submits Proof of Payment.
9. Mother Escrow reimburses the Cranker at the next epoch, and settlement fees are distributed according to the active TSN split.

### Auto-Claim Behavior

1. Claims are automatic for users who are already onboarded and have a bound wallet.
2. Recipients do not need to manually start claim in the normal path.
3. Only new/unbound recipients remain held in escrow until onboarding is completed and wallet binding is done.
4. Once onboarding and wallet binding are complete, payout can continue through the TSN cranker path.

### Legacy Claim Flow - Direct Release

Before TSN, recipients claimed by connecting a wallet, signing a release transaction, and receiving funds directly from escrow. This path still exists for compatibility and recovery, but it does not provide the same settlement privacy because the escrow release can directly link escrow state to a recipient wallet.

---

## Security Model

| Guarantee                            | How it works                                                        |
| ------------------------------------ | ------------------------------------------------------------------- |
| Noncustodial escrow                  | Funds lock into Solana escrow accounts governed by program rules    |
| Per-payment isolation                | Each payment has its own payment PDA and escrow vault               |
| Address-poisoning resistance         | Sender pays an identity, not a pasted wallet address                |
| Sender privacy                       | Recipient does not need the sender wallet                           |
| Recipient privacy                    | Sender does not need the recipient wallet                           |
| Cranker exclusivity                  | One Cranker holds an execution lease for a payment at a time        |
| Proof-based reimbursement            | Cranker recovery depends on valid proof submission                  |
| LP accounting                        | Liquidity positions track funded vault capital                      |
| Operational funding checks           | Verifier SOL balance is checked before send transaction preparation |
| Registered Cranker intent submission | Only registered Crankers can create TSN payment intents on-chain    |
| Verifier-funded account setup        | Verifier PDA funds payment-intent account setup                     |
| Gas-neutral Cranker execution        | Verifier PDA reimburses Cranker gas without adding a profit premium |
| 1:1 Cranker claim credit             | Crankers earn claim eligibility instead of execution tips           |
| Advanced Fraud Detection             | Privacy-respecting anomaly detection in mempool operations          |
| Cranker Jail System                  | Automated punishment for malicious cranker behavior via reputation  |

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
- **Advanced AI fraud detection and protection in mempool**

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

[TINS Overview](tins-registrar/README.md)

### Milestone 4 - TSN Settlement Network

Cranker execution, Proof of Payment, mempool-first intents, and epoch reimbursement architecture.

## Repository Structure

| Path             | Purpose                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `frontend`       | Next.js dApp and user flow UI                                        |
| `backend`        | API, orchestration, and service logic                                |
| `tsn/protocol`   | Anchor program workspace                                             |
| `tsn`            | TSN modules, scripts, and SDK packages                               |
| `tins-registrar` | TINS on-chain identity protocol                                      |
| `docs`           | **Architecture and operational docs** � [Start here](docs/README.md) |

## Quick Start

```bash
cd backend && npm install && tsx scripts/init-db.ts && npm run dev
cd frontend && npm install && npm run dev
```

---

## Documentation

### For Investors & Partners

| Document                                             | Description                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| [docs/OPPORTUNITY.md](docs/OPPORTUNITY.md)           | **Start here** � Investment opportunity, yield projections, partnership benefits |
| [docs/LIQUIDITY.md](docs/LIQUIDITY.md)               | How to fund TSN vaults and earn LP rewards                                       |
| [docs/EPOCH-SETTLEMENT.md](docs/EPOCH-SETTLEMENT.md) | Understanding the epoch reimbursement cycle                                      |

### For Cranker Operators

| Document                                             | Description                              |
| ---------------------------------------------------- | ---------------------------------------- |
| [docs/CRANKER.md](docs/CRANKER.md)                   | Complete guide to running a cranker node |
| [docs/OPERATOR.md](docs/OPERATOR.md)                 | Technical setup and monitoring           |
| [docs/EPOCH-SETTLEMENT.md](docs/EPOCH-SETTLEMENT.md) | How epoch reimbursements work            |

### For Developers

| Document                                     | Description                             |
| -------------------------------------------- | --------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture overview            |
| [docs/TINS.md](docs/TINS.md)                 | Transfer Identity Number System         |
| [docs/PROTOCOL.md](docs/PROTOCOL.md)         | Core protocol specifications            |
| [docs/DEVELOPER.md](docs/DEVELOPER.md)       | Security considerations and integration |
| [docs/API.md](docs/API.md)                   | API reference                           |

### All Documentation

See [docs/README.md](docs/README.md) for complete navigation.

---

## Funding & Support

**Superteam Agentic Engineering Grant** � Approved for **200 USDG** to accelerate fraud protection system development.

Grateful to [@SuperteamEarn](https://twitter.com/SuperteamEarn) and the [@SuperteamNG](https://twitter.com/SuperteamNG) community for the support. Special thanks to [@NzubeEzudo](https://twitter.com/NzubeEzudo), and [@Harri_Obi](https://twitter.com/Harri_Obi) ??

This grant is powering the next phase of building **identity-first private payments** on Solana.

---

**TrustLink Pay** - identity-first payments on Solana, settling through TSN with privacy, liquidity-backed execution, and open protocol infrastructure that developers can build on.
