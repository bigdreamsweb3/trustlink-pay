# Execution Plan V2

## Overview

Execution Plan V2 is the canonical payment execution specification generated locally by the TSN SDK on the sender's device. It defines exactly what the TSN program and Cranker will execute on-chain.

## Funding Modes

### wallet_only_v2
- Payment funded entirely from connected wallet
- Wallet signs full commitment
- TIN balance can be paid first with wallet covering remainder

### zk_pru_only_v2
- Payment funded entirely from ZK-PRU balance
- PRU spend authorizations signed locally
- No wallet involvement in funding

### mixed_zk_pru_wallet_v2
- Payment uses available ZK-PRU balance first
- Wallet covers the remainder
- ZK-PRU spend amounts determined locally before submission

## Plan Structure

```typescript
interface ExecutionPlanV2 {
  fundingMode: 'wallet_only_v2' | 'zk_pru_only_v2' | 'mixed_zk_pru_wallet_v2';
  tokenMintAddress: string;
  commitmentHash: string;
  escrowAmountBaseUnits: string;
  senderFeeAmountBaseUnits: string;
  tinBalancePayments: TinBalancePayment[];
  pruSpendSelections?: PruSpendSelection[];
  recipientRoute: RecipientRoute;
  routing: RoutingData;
  receipts: ReceiptData[];
  stateUpdates: StateUpdate[];
}
```

## Spend Selection (8-Priority Algorithm)

1. **Direct single PRU**: One PRU fully covers payment
2. **Multi-PRU consolidation**: Combine multiple PRUs
3. **Wallet top-up**: Wallet covers PRU shortfall
4. **Full consumption**: PRU balance ≤ payment amount
5. **Large payment**: Payment ≥ standard tranche
6. **Small payment**: Extract trance, route change
7. **Empty reserve consumption**: Use empty PRUs for change routing
8. **Rejection**: Payment impossible

## Tranche Model

- **Full consumption**: PRU balance ≤ payment amount → spend entire balance
- **Large payment**: Payment ≥ standard tranche → direct payment, change to fresh PRU
- **Small payment**: Payment < standard tranche → extract trance, change to fresh PRU

## Fee Model

- Priority fee: ~0.001 SOL per instruction
- Program fees: Set by on-chain program
- Unified fee calculation regardless of source count

## Settlement Flow

```
Execution Plan V2
      ↓
TSN Node (verify + reserve)
      ↓
Cranker (pay fees + submit)
      ↓
TSN Program (verify + enforce)
      ↓
TSN Escrow (hold assets)
      ↓
Recipient (receive)
```

## Authorization Signatures

- **Main wallet signature**: Full route commitment
- **PRU spend signatures**: Scoped to amount + nonce + intent
- **Sponsored settlement signature**: Payer authorization
- **Scoped signatures**: Domain-separated, time-bound

## State Updates

After settlement:
- PRU balances updated
- Active receiving PRU rotated if needed
- Empty reserves replenished
- Settlement timestamp recorded
- Balance history committed
