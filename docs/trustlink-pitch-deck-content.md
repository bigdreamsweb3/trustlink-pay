# TrustLink Pay — Superteam Pitch Deck Content

---

## Slide 1 — Title

**Name:** TrustLink Pay

**Tagline:** Pay by phone. Settle on Solana.

**One-liner (X for Y format):** UPI for Solana stablecoin payments — powered by a decentralised settlement network.

**Contact:**
- GitHub: [github.com/bigdreamsweb3/trustlink-pay](https://github.com/bigdreamsweb3/trustlink-pay)
- Pitch deck: [pitch.com/v/trustlink-pay-pitch-7d8h4e](https://pitch.com/v/trustlink-pay-pitch-7d8h4e)
- Pitch video: [youtube.com/shorts/9IH888rWwDo](https://youtube.com/shorts/9IH888rWwDo?si=Pe3-PPU3oUjhVezq)

---

## Slide 2 — Problem

**The pain point:** A Solana wallet address is 44 random characters — impossible to memorise, trivial to mistype, and irreversible if wrong.

**Data points:**

| Fact | Source |
| --- | --- |
| $2.91M lost in a single address poisoning attack | Solscan, Nov 23, 2024 |
| 1 wrong character = permanent loss | Blockchain irreversibility |
| 500M+ people in emerging markets already pay by phone number (OPay, UPI, Pix) | Public data |
| These users are the most underserved by crypto UX | Market gap |

**Before / After:**

| Before TrustLink | After TrustLink |
| --- | --- |
| Paste `4yfu48GhqFBMDrHJr9VBnGMDHJr9gnhY` and hope it's right | Type `+234 803 456 7890` — you already know this number |
| One wrong character = funds gone forever | Escrow holds funds until recipient proves ownership |
| Recipient needs SOL to claim | Recipient needs only their phone |

---

## Slide 3 — Solution

**TrustLink Pay is a noncustodial Web3 dApp on Solana — not a WhatsApp payment app.**

WhatsApp's role: identity verification, session authentication, and payment notifications.
Solana's role: settlement, escrow, cryptographic proof.

**How it works:**
1. Sender types a phone number and amount
2. TrustLink verifies the recipient identity before any money moves
3. Funds lock into a per-payment escrow vault on Solana
4. A Cranker node pays the recipient, submits Proof of Payment on-chain
5. Recipient claims without needing SOL — TrustLink sponsors gas

**What makes this unique:**
- Sender never sees a wallet address → address poisoning eliminated
- Settlement runs through a decentralised Cranker network, not TrustLink's servers
- Privacy by default — recipient identity never on-chain
- Evolving into TINS: open infrastructure any Solana developer builds on

---

## Slide 4 — Why Now

| Signal | Why it matters |
| --- | --- |
| Solana stablecoin volume at all-time highs (Q1 2025) | The rails are ready |
| WhatsApp Business API matured and globally accessible | The identity layer is accessible |
| Address poisoning attacks increasing and documented | The problem is visible and costly |
| OPay 40M+ users, UPI 10B+ annual transactions, Pix 150M+ users | The market already trusts phone-number payments |
| No crypto-native product has combined these layers end-to-end | The gap is real and open |

---

## Slide 5 — Market Size

| Layer | Size |
| --- | --- |
| **TAM** — Global P2P payments market | $2+ trillion annually |
| **SAM** — Emerging market stablecoin-eligible mobile money users | 500M+ (Nigeria, India, Brazil, SE Asia) |
| **SOM** — WhatsApp-active remittance senders in target markets (Year 1) | 10M reachable users |

**Why this market:**
- Nigeria: OPay has 40M+ users. WhatsApp penetration ~90%
- India: UPI processes 10B+ monthly transactions
- Brazil: Pix has 150M+ active users
- These users already understand phone-number payments — they just need the crypto rails

---

## Slide 6 — Product

**Live on Solana devnet:**

- **Send:** Enter phone number → verify recipient identity → wallet signs → funds enter escrow PDA
- **Claim (TSN):** Recipient posts claim request (no wallet sig, no gas fee) → Cranker pays from vault liquidity → Proof of Payment on-chain
- **Identity:** WhatsApp OTP session auth → 6-digit PIN → wallet connection for payments
- **Merchant trust:** WhatsApp Business identity surfaces to sender before payment confirms
- **Delivery receipts:** Sent → Delivered → Seen — same confidence as a bank alert

**Privacy by design:**
- On-chain: proof that payment happened, which Cranker executed it
- Off-chain: recipient identity encrypted in Cranker's private audit ledger (AES-256-GCM)

📸 [Screenshots + demo: public/screenshots/]
🎬 [Demo video: youtube.com/shorts/9IH888rWwDo](https://youtube.com/shorts/9IH888rWwDo?si=Pe3-PPU3oUjhVezq)

---

## Slide 7 — Traction

| Milestone | Details |
| --- | --- |
| **StableHacks 2026** | Submitted to global Solana hackathon by Tenity — Track: Programmable Stablecoin Payments |
| **The Bags Hackathon** | Submitted — Track: Payments. Creator token payments live. `$OOPS` launched on Bags |
| **TSN devnet validated** | Cranker vault, claim flow, Proof of Payment, and epoch settlement structure tested |
| **GitHub** | [github.com/bigdreamsweb3/trustlink-pay](https://github.com/bigdreamsweb3/trustlink-pay) — 29 files, +876 lines in M4 alone |

**What is live today:**
- WhatsApp OTP auth ✅
- Per-payment noncustodial escrow (v2 + v3 hardened) ✅
- TSN scaffold: Mother Escrow, Cranker PDA, intent state machine, Proof of Payment ✅
- Cranker vault with non-custodied LP positions ✅
- Encrypted Cranker audit ledger ✅
- Bags creator token integration ✅

---

## Slide 8 — Business Model

**Every payment generates two fee moments:**

| Fee | Amount | Collected |
| --- | --- | --- |
| Sender fee | ~0.1 USDC on 100 USDC transfer | At payment creation |
| Claim fee | ~0.1 USDC deducted from payout | At Cranker settlement |

**Sender fee distribution:**

| Recipient | Share |
| --- | --- |
| Cranker operator | 50% |
| Liquidity providers | 40% |
| TrustLink treasury | 10% |

**Claim fee:** 100% stays in the Cranker pool. Treasury does not take from settlement execution.

**Why this model works:**
- Users experience ONE simple fee — sub-0.5% on transfers (better than remittance incumbents)
- Cranker operators earn real yield from real payment volume
- LPs earn passive income from vault liquidity with non-custodied position PDAs
- TrustLink treasury earns 10% of sender fees to fund audits, development, and operations
- As TINS expands to third-party developers, infrastructure licensing becomes an additional revenue stream

---

## Slide 9 — Competition

| Product | Model | Difference from TrustLink |
| --- | --- | --- |
| WhatsApp Pay | Custodial, fiat, chat-native | TrustLink is noncustodial, stablecoin, standalone dApp |
| Venmo / PayPal | Custodial, fiat, requires bank | TrustLink needs no bank. Crypto-native. |
| Stellar Anchor / Celo | On-chain payments, address-based | TrustLink removes wallet address from the UX entirely |
| Binance Pay | Centralised exchange | TrustLink is noncustodial. No exchange. Solana-native. |

**TrustLink's unique position:**
- Identity-first (phone number → escrow routing)
- Noncustodial (program-enforced, no operator sweep risk)
- Decentralised settlement (Cranker network, not a centralised server)
- Privacy-preserving (recipient identity encrypted, never on-chain)
- Open protocol direction (TINS — any developer integrates)

---

## Slide 10 — Team

**Daniel Matthew** — Founder
- Building TrustLink Pay, TINS, and the TSN settlement network
- Product, protocol design, and full-stack development
- [@0xbigdream](https://x.com/0xbigdream)

*[Add any additional team members, advisors, or relevant credentials here]*

**Why we are qualified:**
- Full product is live and tested on devnet
- M4 settlement scaffold (29 files, +876 lines) built and validated
- Deep understanding of both the emerging market user problem and the Solana technical stack
- Active in the Solana ecosystem (StableHacks, Bags Hackathon)

---

## Slide 11 — Ask / Roadmap

**Roadmap:**

| Phase | What | When |
| --- | --- | --- |
| **Now** | TSN devnet: Cranker vault, lease claiming, Proof of Payment | Live |
| **M3** | TINS on-chain identity registry — moves identity routing fully on-chain | Active |
| **M4 completion** | Full epoch reimbursement, sender fee distribution, Cranker SDK open beta | Next 2 months |
| **Mainnet** | Full production launch, real volume, Cranker SDK public | Post-audit |
| **TINS open protocol** | Third-party Solana developers integrate TINS directly | 6–12 months |

**The ask:** [Insert funding amount]

**What funding goes toward:**
- Smart contract security audit (required before mainnet)
- Cranker SDK development and open beta
- TINS protocol completion
- Go-to-market in Nigeria, India, and Brazil
- Team expansion (Solana engineer + growth)

---

## Slide 12 — Closing

**TrustLink Pay**

*Pay by phone. Settle on Solana.*

Crypto payments should feel as familiar as mobile money and as trustworthy as a bank — settled in seconds on a public blockchain with no wallet addresses, no custodians, and no single point of failure.

We are building the payment infrastructure that the next billion users deserve.

🔗 [github.com/bigdreamsweb3/trustlink-pay](https://github.com/bigdreamsweb3/trustlink-pay)
🔗 [Pitch deck](https://pitch.com/v/trustlink-pay-pitch-7d8h4e)
🔗 [60s demo video](https://youtube.com/shorts/9IH888rWwDo?si=Pe3-PPU3oUjhVezq)
