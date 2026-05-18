# TrustLink Pay Protocol Specification

## Overview

TrustLink Pay is a privacy-preserving payment protocol on Solana. Users send stablecoins to phone numbers. The protocol handles settlement through the Transfer Settlement Network (TSN).

## Core Concepts

### Payment Intent

A payment intent represents a sender's intention to transfer funds. It contains:

- `id`: Unique payment identifier
- `sender`: Sender's wallet address
- `recipient`: Resolved phone number or TIN
- `amount`: Transfer amount in USDC/supported token
- `fee`: Sender-side fee
- `status`: pending → claimed → settled

### TIN (Transfer Identity Number)

A permanent 10-digit identifier owned by a user as a Solana PDA. Format: `TIN-XXXX-XXXX`

```typescript
interface TransferIdentityNumber {
  tin: string;           // e.g., "TIN-1234-5678"
  owner: PublicKey;       // Owner's wallet
  phoneNumber?: string;   // Optional linked phone
  createdAt: number;     // Unix timestamp
}
```

### Escrow

Smart contract holding funds pending settlement. Each payment has its own escrow:

- Sender funds escrow
- Cranker executes payout from vault
- Proof triggers reimbursement

## Send Flow

```
1. Sender enters recipient phone/TIN
2. Backend resolves identity
3. Sender approves transfer + fees
4. Funds lock into escrow
5. Payment intent published to mempool
6. Recipient notified
```

## Claim Flow

```
1. Recipient initiates claim
2. Connects wallet
3. Cranker detects intent
4. Cranker acquires lease
5. Cranker pays from vault
6. Cranker submits proof
7. Epoch reimbursement
```

## Privacy Model

| Data | Visible |
| --- | --- |
| Payment intent exists | Public |
| Claim request | Cranker only |
| Payout transaction | Public (no wallet link) |
| Sender wallet | Escrow only |
| Recipient wallet | Private |

## Fee Distribution

| Recipient | Share |
| --- | ---: |
| Liquidity Providers | 87% |
| Protocol Treasury | 8% |
| Cranker/Operator | 5% |

## Smart Contracts

See `tsn/protocol/programs/` for Anchor programs:

- `trustlink-escrow`: Escrow vault
- `tsn Mother Escrow`: Settlement coordinator
- `tsn Cranker`: Operator execution

## State Machines

### Payment States

```
created → funded → claimed → reimbursed
         ↓
      expired → refunded
```

### Cranker Lease States

```
idle → acquire_lease → execute → submit_proof → reimbursed
```

## Security Properties

- Noncustodial: Funds in escrow, not protocol
- Per-payment isolation
- No address poisoning (identity-based)
- Cranker exclusivity (one lease at a time)
- Proof-based reimbursement