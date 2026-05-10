# TrustLink Pay

> Blockchain payments as familiar as mobile money. Privacy built into settlement. Open infrastructure anyone can build on.

The world already knows how to pay with a phone number. Nigeria uses OPay. India uses UPI. Brazil uses Pix. Billions of transactions happen every day through these systems because they solved the one thing crypto has not: **identity-first payments**.

TrustLink Pay is building that identity layer for Solana stablecoins — starting with WhatsApp phone numbers, expanding to a permanent on-chain identity system that any developer can integrate, and settling through the Transfer Settlement Network (TSN) — a decentralised Cranker layer where independent operators earn fees for executing payments and liquidity providers earn yield on deployed capital.

---

## Project Architecture

TrustLink Pay's system works in two distinct layers that exist right now and where they are going.

### Layer One — TrustLink Pay Today

When a user registers, TrustLink verifies their WhatsApp phone number and stores a mapping in its own database: this phone number belongs to this user's on-chain identity. When a sender enters a phone number, TrustLink's backend resolves it and routes the payment to the right escrow vault on Solana.

The identity map is in TrustLink's database. The money is not. TrustLink's backend cannot touch funds in escrow — releasing them requires on-chain proof from the rightful recipient. No wallet address is ever shown to the sender or recipient.

Settlement — the part where the recipient actually receives funds — runs through the Transfer Settlement Network (TSN). Crankers watch for pending payment intents and claim requests, execute payouts from their vault liquidity, submit Proof of Payment on-chain, and recover their funds at the next settlement epoch. The direct claim path (where the recipient signed a transaction to release escrow themselves) is the legacy flow. TSN is the current flow.

### Layer Two — Where This Is Going: TINS

The Transfer Identity Number System moves identity routing fully on-chain.

Under TINS, every user owns a permanent 10-digit Transfer Identity Number as a Solana PDA. No database. No backend required. Any developer on Solana can call the TINS program directly to resolve a TIN, create a payment intent, and route funds into escrow — without depending on TrustLink's infrastructure at all.

TrustLink Pay's long-term role in the TINS ecosystem is to be the application that bridges social identity to on-chain identity. TrustLink verifies that your WhatsApp number is real, then links it to your TIN. In the future, TrustLink can link your X account, your verified business identity, or any other social signal to the same TIN. The TIN becomes the identity primitive. The social layer becomes the trust signal. Other Solana applications can build on top of the same TIN without needing TrustLink at all.

This matters because the biggest risk in crypto payments is not blockchain complexity — it is trust. When a sender in Lagos wants to pay a merchant in London, they need to trust that the phone number they are typing resolves to the right person. TINS makes that resolution cryptographically verifiable and publicly auditable on Solana, not dependent on a company's uptime.

### Layer Three — TSN: The Settlement Network

The Transfer Settlement Network is the execution layer that handles how payments actually get to recipients.

In TrustLink Pay's current system, the backend orchestrates claim execution directly. In the TSN model, independent Cranker operators take over that role. Crankers are economic actors who provide liquidity, execute settlements, submit cryptographic proof on-chain, and earn fees for doing so.

The result: payments settle even if TrustLink's servers go offline. No single company controls whether your payment arrives.

---

## Who Builds on TrustLink and TINS

**Users sending money home.** Remittances across Africa, Asia, and Latin America currently cost 5–10% in fees and take days. TrustLink targets sub-0.5% fees settling in seconds. The recipient needs only a phone.

**Merchants getting paid via WhatsApp.** Millions of businesses operate primarily through WhatsApp. TrustLink lets a customer pay a WhatsApp Business number and the merchant receives USDC directly — no point-of-sale terminal, no bank account required.

**Developers building payment infrastructure.** Once TINS is live, any Solana developer can call the TINS program to resolve a transfer identity and route a payment. They do not need TrustLink's database. They do not need TrustLink's permission. The identity layer is a public on-chain primitive.

**Entities who want to run settlement infrastructure.** The Cranker SDK will be open. DeFi treasuries, payment processors, and infrastructure operators can deploy capital into Cranker vaults, earn yield from real payment volume, and operate settlement nodes that serve the entire network.

---

## The Economics of Running a Cranker

### How fees work

Every payment has two fee moments, both transparent:

**At send time:**
The sender pays the transfer amount plus a sender fee. Example: sender pays 100 USDC to the recipient plus 0.1 USDC sender fee. The 100 USDC locks into the payment escrow PDA. The 0.1 USDC sender fee moves into the settlement fee pool.

**At claim time:**
The Cranker pays the recipient 99.9 USDC instead of 100. The 0.1 USDC difference is the claim fee — it stays inside the Cranker pool and is never shared with the treasury. At epoch settlement, the Mother Escrow reimburses the Cranker the full 100 USDC from escrow. The Cranker spent 99.9, recovers 100, and retains 0.1 as profit — entirely within the Cranker system.

### Fee distribution

**Sender fee** (paid by sender at time of transfer):

| Recipient | Share | Why |
| --- | --- | --- |
| Cranker operator | 50% | For uptime, execution, and on-chain transaction fees |
| Liquidity providers | 40% | For funding the Cranker vault |
| TrustLink treasury | 10% | Protocol development, audits, security reserves |

**Claim fee** (deducted from payout at settlement):

| Recipient | Share |
| --- | --- |
| Cranker pool (operator + LPs) | 100% |
| TrustLink treasury | 0% |

Claim fees never leave the Cranker pool. They represent pure yield generated by the liquidity deployed into the vault. The treasury has no claim on settlement execution income.

### What a Cranker operator actually earns

On a 100 USDC payment with a 0.1 USDC sender fee and 0.1 USDC claim fee:
- **50% of sender fee** = 0.05 USDC (operator share)
- **Claim fee profit** = 0.1 USDC (entire claim fee stays in pool)
- **Net per payment at scale**: small individually, significant at volume

A Cranker processing 10,000 USDC per day at these rates earns approximately 15 USDC per day — plus any LP yield distributed to the operator if they have also funded their own vault.

### What a liquidity provider earns

LPs fund the vault that Crankers draw from to pay recipients. Each LP receives a `LiquidityPosition` PDA on-chain — a verifiable record of their deposit that only they can withdraw. No custodian. No counterparty risk from the operator.

LPs earn:
- 40% of all sender fees generated by payments their vault helped settle
- Proportional to their share of vault liquidity

Deep liquidity means the Cranker can settle larger payments and process more volume — increasing absolute LP earnings.

---

## Privacy in Settlement

### What is public

Every payment leaves a permanent on-chain record:
- That a payment intent existed and was claimed
- Which Cranker acquired the execution lease and submitted proof
- That the settlement was valid and cryptographically verified
- Epoch aggregate totals

No wallet addresses. No phone numbers. No payment amounts are exposed in the public record.

### What is private

Every Cranker maintains an encrypted audit ledger. When a payment is settled, the Cranker writes a private record containing:
- The real recipient wallet
- The recipient's phone number or TIN
- The sender's identity
- The exact payment amount

This data is encrypted with AES-256-GCM using the Cranker's own private key. Nobody reads it without the Cranker's key. It never touches a shared database or public storage.

### Why this matters for compliance

If regulators or law enforcement need to investigate a specific transaction — stolen funds, fraud, sanctions violations — the on-chain record proves which Cranker processed it. The Cranker operator can produce the decrypted record under a legal order.

The model is: **the blockchain proves it happened, the Cranker knows who was involved, and disclosure requires due process**. This is more rigorous than most payment systems and more privacy-preserving than any purely on-chain system that exposes addresses by default.

---

## The Path to Full Decentralisation

| Now | With TINS | With mature TSN |
| --- | --- | --- |
| Identity routing in TrustLink DB | Identity routing on-chain via TIN PDAs | Any app resolves TINs directly |
| TrustLink backend orchestrates claims | Claim requests recorded off-chain | Claim requests on Arweave/permanent storage |
| Single operator model | Open Cranker SDK | Competitive Cranker network |
| TrustLink links WhatsApp to identity | TrustLink links all social identity to TINs | Any identity provider links to TINs |

The product proves the UX. The protocol makes it permanent and open.

---

## How It Works

### Send Flow

1. Sender logs in and enters a recipient phone number plus amount.
2. TrustLink verifies recipient identity before any money moves.
3. Sender confirms — wallet signs — funds lock into a unique escrow vault PDA.
4. Sender fee moves to the settlement fee pool.
5. Backend records a TSN payment intent linked to the escrow.
6. Recipient receives a WhatsApp notification or the sender shares an invite link.

### Claim Flow — TSN (current)

1. Recipient opens TrustLink and posts a claim request — no wallet signature required, no Solana fee paid at this step.
2. A Cranker detects the pending intent and matching claim request.
3. Cranker atomically acquires the 30-second execution lease on-chain — only one Cranker per payment, enforced at the program level.
4. Cranker pays recipient 99.9 USDC (100 minus the 0.1 claim fee) from its vault liquidity.
5. Cranker submits Proof of Payment on-chain.
6. Cranker writes an AES-256-GCM encrypted record to its private audit ledger — recipient identity and amount never touch a public database.
7. At each settlement epoch (every 7 hours), Mother Escrow reimburses the Cranker the full 100 USDC from the payment escrow.
8. Sender fee pool distributes at epoch: 50% Cranker operator, 40% LPs, 10% treasury.

### Legacy Claim Flow — Direct Release (pre-TSN, for reference)

Before TSN, recipients claimed by connecting a Solana wallet, signing a release transaction, and receiving funds directly from escrow in the same on-chain operation. This flow still exists in the program but is not used in the current product. It has no settlement privacy — the on-chain transaction links the escrow PDA to the recipient's wallet address directly.

---

## Security Model

| Guarantee | How it works |
| --- | --- |
| Noncustodial | TrustLink cannot touch escrow — only valid on-chain proof releases funds |
| Per-payment isolation | Each payment has its own escrow vault PDA |
| Address poisoning eliminated | Sender never sees a wallet address |
| Replay prevention | Nonce-consumption PDAs; consumed nonces cannot reuse |
| Derivation proof | Master key binds child key to escrow, nonce, expiry, destination |
| Front-run resistance | Destination hash verified before any token transfer |
| Cranker exclusivity | One Cranker holds one lease per intent — atomic on-chain enforcement |
| Proof-based reimbursement | Cranker only recovers escrow funds after valid PoP on-chain |
| LP non-custody | LiquidityPosition PDAs owned by funder; operator cannot withdraw LP funds |
| Encrypted settlement privacy | Recipient identity never on-chain; Cranker ledger AES-256-GCM encrypted |

---

## Current Status

**Live:**
- WhatsApp OTP authentication
- Phone-number identity routing via TrustLink backend
- Per-payment escrow v3 (ephemeral child keys, derivation proofs, nonce PDAs, destination binding)
- Gasless UX for senders and recipients
- WhatsApp Business merchant verification
- Real-time delivery receipts (Sent → Delivered → Seen)
- TSN M4: Mother Escrow, Cranker PDA, intent state machine, lease claiming, Proof of Payment
- Cranker vault with per-funder LiquidityPosition PDAs
- Encrypted Cranker audit ledger
- Local Cranker daemon and setup scripts

**In active development:**
- TINS on-chain identity registry (M3)
- Full epoch reimbursement with sender fee distribution
- Arweave/Irys permanent claim and settlement archival

---

## Milestones

### Milestone 1 — StableHacks 2026
[StableHacks 2026](https://dorahacks.io/hackathon/stablehacks/detail) · Organised by [Tenity](https://dorahacks.io/org/14594/hackathon) · **Track:** Programmable Stablecoin Payments

Proved the end-to-end product: WhatsApp-verified identity, per-payment escrow, gasless UX, hardened v3 architecture.

### Milestone 2 — The Bags Hackathon
[The Bags Hackathon](https://dorahacks.io/hackathon/the-bags-hackathon/detail) · **Track:** Payments

Extended TrustLink to creator token payments via phone number using the Bags SDK. Any Bags creator token can be sent to a WhatsApp number. `$OOPS` token launched on [Bags](https://bags.fm/).

### Milestone 3 — TINS Protocol
*Active development.* Moving identity routing from TrustLink's database to a permanent on-chain registry.
[TINS Overview](transfer-identity-number-system-(TINS)/README.md)

### Milestone 4 — TSN Settlement Network
*Scaffolded and devnet-tested.* Cranker execution, Proof of Payment, vault liquidity, encrypted audit ledger, epoch settlement architecture.

---

## Repository Structure

| Path | Description |
| --- | --- |
| `backend/programs/trustlink-escrow` | Anchor escrow program (v2 + v3 + TSN M4) |
| `backend/app/blockchain/solana-tsn.ts` | TSN transaction builders |
| `backend/scripts/tsn-setup.ts` | Mother Escrow, Cranker, vault, epoch scripts |
| `backend/scripts/tsn-cranker.ts` | Local Cranker daemon |
| `cranker-sdk` | Standalone Cranker SDK scaffold |
| `docs/devnet-testing.md` | Devnet testing guide |
| `transfer-identity-number-system-(TINS)` | TINS on-chain identity program track |

## Quick Start

```bash
cd backend && npm install && tsx scripts/init-db.ts && npm run dev
cd frontend && npm install && npm run dev
```

---

**TrustLink Pay** — identity-first stablecoin payments on Solana, settling through a decentralised network of Cranker operators, with privacy built into every transaction and open protocol infrastructure that any developer can build on.
