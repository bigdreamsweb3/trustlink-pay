# Transfer Settlement Network (TSN): The Privacy-First Settlement Layer for Identity-Based Stablecoin Payments

## Introduction: The Missing Layer in Blockchain Payments

Blockchain solved decentralized ownership and transparent settlement.

Stablecoins solved digital dollar movement.

But daily payments still lack:

- Human-readable payment identity
- Recipient privacy
- Wallet abstraction
- Programmable payments
- Safer payment experiences

This establishes the search intent.

## The Evolution of Settlement Infrastructure

The settlement infrastructure has evolved through distinct phases:

**Traditional Finance:**
```
Bank account → Payment network → Settlement
```

**Blockchain:**
```
Wallet address → Blockchain transaction
```

**TrustLink Pay:**
```
Identity → TSN Settlement → Blockchain verification
```

This places TSN as the next evolution of settlement infrastructure.

## What Is the Transfer Settlement Network (TSN)?

TSN stands for **Transfer Settlement Network Protocol**.

It is the settlement layer that coordinates payment intents, escrow holds, Cranker execution, and settlement proofs so the chain does not show a simple sender-wallet-to-recipient-wallet payment graph.

TSN accepts sender-authorized payment work, moves funds through an escrow path, and coordinates recipient payout through vault liquidity. It uses commitments and epoch records so the public chain can verify settlement without needing the full private payment graph.

## Why Wallet Addresses Are Not Enough for Global Payments

Wallet addresses are powerful for ownership but poor as payment identities.

Current challenges include:

- **Address exposure:** Long, error-prone addresses that expose transaction history
- **Transaction history visibility:** Complete visibility of all payment activity
- **Address poisoning risks:** Sophisticated attacks that exploit address confusion
- **Poor user experience:** Difficult for everyday payments
- **Difficult merchant adoption:** Complex onboarding and integration requirements

Blockchain payments require a better abstraction layer that separates human payment identity from settlement infrastructure.

## TIP: The Transfer Identity Protocol

The Transfer Identity Protocol is the identity foundation of TrustLink Pay. It provides a human-friendly identity layer for blockchain payments while separating user identity from public settlement infrastructure.

Traditional blockchain payments require users to share wallet addresses as payment identifiers. While wallet addresses provide ownership control, they expose settlement history, create privacy concerns, and introduce usability challenges for everyday payments.

TIP introduces a new identity model where users interact through payment identities instead of directly sharing blockchain addresses.

### Transfer Identity Number (TIN)

At the core of TIP is the **Transfer Identity Number (TIN)** — a unique 10-digit payment identity designed to allow users and businesses to send and receive payments without exposing their wallet addresses.

A TIN functions as a portable payment identifier that connects a user's chosen identity to the TSN settlement architecture.

Instead of:

```
Sender Wallet Address → Recipient Wallet Address
```

TSN enables:

```
Sender → TIN Identity → TSN Settlement → Recipient Settlement Infrastructure
```

The TIN does not represent ownership of funds by itself. Ownership remains secured through cryptographic wallet authorization and blockchain verification.

### Transfer Identity Name

TIP also supports human-readable identity information through Transfer Identity Names.

While the TIN provides a reliable numerical payment identifier, Transfer Identity Names improve usability by allowing users and businesses to create recognizable payment identities.

TIP separates discoverable identity from settlement infrastructure, allowing users to decide what identity information they share.

### Identity Privacy Model

The principle behind TIP is:

> People should be discoverable by the identities they choose to share, not by the identities others search for.

TIP does not create a public directory of wallet ownership. Instead, it provides a controlled identity layer where:

- Users own their identity association
- Identity information is selectively exposed
- Settlement destinations remain separated from public identity discovery
- Blockchain verification remains transparent

### Role of TIP Within TSN

TIP provides the identity abstraction layer required for TSN's settlement architecture.

The relationship is:

```
┌─────────────────┐
│  TIP            │
│  Identity Layer │
└────────┬────────┘
         ↓
┌─────────────────┐
│  TSN            │
│  Settlement     │
│  Coordination   │
└────────┬────────┘
         ↓
┌─────────────────┐
│  Solana         │
│  Blockchain     │
│  Settlement     │
└─────────────────┘
```

TIP makes blockchain payments more understandable for users, while TSN handles the coordination and execution required to complete private, identity-based stablecoin payments.

## ZK-PRU Protected Receiving Identities

ZK-PRU protected receiving identities are the purpose-bound authorization endpoints used by TSN settlement.

Every upgraded Transfer Identity can have a configured set of ZK-PRU handles. Recipient payouts go to authorized protected routes instead of the owner wallet. The authenticated owner can load public route metadata for balance reads, but the frontend never receives raw ZK-PRU private keys or decrypted master seed material.

A ZK-PRU handle is a token-agnostic, purpose-bound receiving authorization for supported TSN settlement assets. It is not a user-facing wallet.

Each PRU carries:

- The TIN it belongs to
- Its index within the TIN's PRU set
- A derived public key
- Encrypted metadata
- A lifecycle state

### ZK-PRU Lifecycle

A ZK-PRU handle is in one of two states:

- **ACTIVE:** The PRU is ready to receive funds. Its token account exists on-chain.
- **SWEPT:** Funds have been consolidated from this PRU back to the main TIN owner route.

### TIN Balance

The TIN balance shown to the user is the sum of all non-zero supported token balances across the active PRUs linked to the authenticated TIN.

Every TIN balance exists in one of three states:

- **AVAILABLE:** Funds that are settled and ready to spend
- **PENDING:** Funds in transit, not yet confirmed settled
- **SETTLED:** Funds that have completed the settlement process

The displayed TIN balance is AVAILABLE plus SETTLED minus PENDING.

## ZK-PRU SpendGuard: Separating Identity From Settlement Destination

The blockchain remains public. However, TSN separates:

- **Who is paying** (sender identity via TIN)
- **Who is receiving** (recipient identity via TIN)
- **Where settlement occurs** (ZK-PRU routes)

This creates a privacy-preserving architecture where payment identity and settlement infrastructure are not directly exposed as one public relationship.

The ZK-PRU SpendGuard provides isolated spend authority for each ZK-PRU handle. The `spend_auth_hash` binds that handle to the real TIN owner without storing the owner's wallet address in readable form.

The TIN Master Seed has zero mathematical relationship to wallet signatures. A malicious app can collect ordinary wallet signatures forever and still gains no path to the seed or ZK-PRU keys.

## TSN Settlement Architecture

TSN breaks the direct sender-to-recipient path into separate settlement steps:

```
Sender Authorization → Escrow → Vault Payout → Epoch Accounting
```

This gives the user a normal payment experience while reducing how much of the payment graph is easy to follow.

### Payment Commitment

A `PaymentCommitment` is a lightweight on-chain record.

It stores the minimum public data needed to prove settlement work happened. It should not store the full private route, recipient social identity, or plaintext token.

### Settlement Flow

TSN coordinates payment settlement through these steps:

1. **Authorization:** A payment is authorized by the sender
2. **Validation:** A Cranker validates the intent (signatures, amount, token, recipient route, nonce, expiry, epoch data)
3. **Escrow:** Sender-side funds enter the TSN escrow path
4. **Commitment:** A `PaymentCommitment` is opened and recorded
5. **Payout:** Recipient payout happens from vault liquidity into the selected ZK-PRU route
6. **Aggregation:** The commitment is included in the epoch aggregate root
7. **Settlement:** At epoch settlement, Crankers race to process the challenge
8. **Recovery:** Valid work updates recovery or reimbursement state

The user does not directly coordinate settlement execution. TSN handles the operational complexity required to transform payment intent into verified blockchain settlement.

### Epoch Reservoirs and PEA

Each epoch has an isolated reservoir called a **PEA** (Pooled Epoch Accounting).

The PEA keeps funds and accounting for one epoch isolated from other epochs. This makes recovery and reimbursement easier to reason about.

The mempool backend aggregates private payment commitments into a root hash. That root is a compact proof of the epoch's commitment set.

### Payment Fee Distribution

Normal payment fees have two portions:

- **Sender fee:** Paid on top of the sent amount in the sender co-signed sponsored settlement
- **Recipient fee:** Deducted from the escrowed settlement amount before the private payout permit is signed

The normal payment fee split is:

| Recipient | Share |
| --- | ---: |
| LP vault rewards | 85% |
| Cranker operator | 8% |
| Protocol treasury | 5% |
| Reserve pool | 2% |

The 85% LP share remains in the Cranker vault because that vault is the active liquidity vault for the payout. The non-LP shares (Cranker operator, protocol treasury, reserve pool) are transferred out of the vault in the same payout transaction.

## Crankers: The Settlement Operator Network

Crankers are settlement operators in TSN. They keep the network moving.

A Cranker is software run by an operator. It watches the TSN mempool, validates work, executes settlement tasks, and competes for recovery or reimbursement jobs.

### What Crankers Do

Crankers can:

- Validate payment intents
- Reject tampered or expired work
- Sponsor certain settlement transactions
- Execute payouts from liquidity vaults
- Earn claim or reputation credit
- Participate in epoch settlement races
- Monitor ZK-PRU sweep signals
- Help recover epoch reservoirs
- Verify and relay Transfer Identity creation/update intents

### Work Types

**Intent Work:** Checks whether a pending payment is valid. A Cranker must verify signatures, amount, token, recipient route, nonce, expiry, and epoch data before moving it forward.

**Settlement Work:** Moves a valid payment into the escrow and payout process. The Cranker should only execute work that matches the sender authorization and TSN rules.

**Recovery Work:** Handles vault or epoch states that need reimbursement. Crankers compete for these jobs through minimal public challenges.

**Transfer Identity Work:** Handles identity registry changes. The user signs an owner intent. Cranker A checks the signature, nonce, expiry, and commitment hashes, then records the first fee transaction. Cranker B submits the Transfer Identity registry transaction.

### Cranker Fee Distribution for TIN Operations

| Recipient | Share |
| --- | ---: |
| Cranker A (first transaction) | 30% |
| Cranker B (registry mutation) | 40% |
| Protocol Treasury | 10% |
| Reserve Pool | 20% |

### Reputation and Slashing

Cranker reputation is the protocol's way to reward useful work and discourage bad work.

Good work can increase a Cranker's standing or unlock more work. Bad work can reduce reputation and may be slashable when governance activates those rules.

## Vaults: Liquidity Layer

Vaults provide liquidity for payouts.

A Cranker can pay the recipient from vault liquidity, then the protocol later reconciles the vault using commitments and epoch accounting.

If every payment had to wait for every internal settlement step, the user experience would feel slow. Vault liquidity lets the recipient receive funds faster. The system then uses epoch accounting to reimburse or recover the vault.

## Epoch Accounting

An epoch is a fixed settlement window.

Each epoch has an isolated reservoir called a **PEA** (Pooled Epoch Accounting). A PEA keeps accounting for one settlement window separate from another. This makes reimbursements easier to audit and reduces the risk that one bad window affects the whole system.

### Epoch Settlement Flow

1. Payment enters TSN as settlement work
2. Commitment is recorded and included in an epoch
3. Epoch settlement triggers reimbursement or recovery of the reservoir
4. Crankers compete to submit valid recovery or reimbursement work

## Stablecoins Need Settlement Infrastructure

Stablecoins already represent digital value.

The missing layer is making stablecoins usable for everyday financial activity:

- Consumer payments
- Business payments
- Subscription payments
- Cross-border commerce
- Automated payment flows

TSN provides the settlement coordination layer required to bring stablecoins closer to modern payment experiences.

## TrustLink Labs: AI-Native Infrastructure Development

TrustLink Labs uses AI-native development workflows to accelerate the research, architecture, and engineering of open financial infrastructure.

The combination of:

- Human architectural vision
- Blockchain engineering
- Artificial intelligence-assisted research and development

enables focused teams to design and build complex financial systems more efficiently.

AI is not replacing engineering; it is accelerating the ability to create new infrastructure.

## Security Considerations

TrustLink Pay does not make Solana private.

It makes the normal payment graph less direct. A determined observer with enough context may still inspect public program activity.

The system must never claim impossible privacy guarantees.

### What Is Always Hidden

- Derivation seeds
- Private keys
- Full ZK-PRU arrays
- Phone numbers
- Raw wallet address relationships
- Individual balance states
- TIN Master Seed material

### What Is Publicly Visible

- The one-way owner pubkey commitment
- ZK-PRU metadata commitment
- Replayable settlement commitments
- Public mempool views use opaque TIN route identifiers instead of raw TIN numbers

### Privacy Boundary

The frontend never derives ZK-PRU handles and never receives the TIN Master Seed. The TrustLink backend does not broker ZK-PRU spend execution. The TSN mempool and Cranker network perform route verification and on-chain funding.

## Conclusion

TSN represents a new settlement architecture where:

- Blockchain provides verification
- TIP provides usability
- Privacy-preserving coordination enables everyday payments
- Crankers provide operational execution
- Epoch accounting provides auditability

The Transfer Settlement Network is designed to become an open settlement layer for identity-based, privacy-aware stablecoin payments.

---

## Related Documentation

| Document | Purpose |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How product, identity, privacy, settlement, and liquidity layers fit together |
| [TRANSFER-IDENTITY.md](./TRANSFER-IDENTITY.md) | TIP, TINs, ZK-PRU handles, route authentication, and identity resolution |
| [TSN.md](./TSN.md) | TSN payment execution, ZK-PRU-funded spending, and fee distribution |
| [CRANKER.md](./CRANKER.md) | Settlement operator network and work types |
| [LIQUIDITY.md](./LIQUIDITY.md) | Vault liquidity and epoch reservoirs |
| [SECURITY.md](./SECURITY.md) | Security boundaries, privacy guarantees, and limits |
