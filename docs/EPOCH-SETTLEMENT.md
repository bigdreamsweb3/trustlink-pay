# Epoch Settlement

Epoch settlement is how TrustLink Pay groups, proves, reimburses, and recovers settlement work over time.

## What Is This?

An **epoch** is a settlement window.

Each epoch has an isolated reservoir called a **PEA**. The PEA keeps that epoch's funds and accounting separate from other epochs.

## Why It Exists

Without epochs, every payment would need its own full recovery and reimbursement path. That is expensive and creates too much public activity.

Epoch settlement batches accounting work.

It lets the system prove aggregate work with fewer transactions and keeps recovery focused on one settlement window at a time.

## How It Works

### 1. Proactive Epoch Creation

The mempool backend should create the next epoch and PEA before the current epoch ends.

The target window is 30 to 60 minutes before rollover. If this fails, operators should see a clear warning.

### 2. Commitment Collection

During an epoch, valid payments produce commitments.

These commitments are added to the epoch's private aggregate set.

### 3. Root Hash

The mempool backend calculates an aggregate root hash.

The root proves the commitment set without exposing each private route.

### 4. Minimal Challenge Release

When an epoch needs settlement or recovery, the system releases a minimal public challenge.

The challenge includes only the values needed for Crankers to compete and verify work.

### 5. Cranker Race

Crankers compete to submit valid recovery or reimbursement work.

The first valid Cranker wins the work. Invalid work can damage reputation and may be slashable depending on the active governance rules.

### 6. Distribution

Recovery distribution follows the protocol split:

| Recipient | Share |
| --- | ---: |
| Liquidity providers | 85% |
| Treasury | 8% |
| Operator reward | 5% |
| Reserve | 2% |

## Example Flow

```text
Epoch starts
PEA is active
Payments create commitments
Mempool builds aggregate root
Next epoch is pre-created
Current epoch closes
Challenge is released
Crankers race
Valid Cranker settles recovery or reimbursement
Epoch record is updated
```

## Security Considerations

- Epochs isolate accounting risk.
- Public challenge data must be minimal.
- Roots must be recomputable by authorized infrastructure.
- Crankers must not be able to claim the same work twice.
- Recovery should prioritize low-liquidity or high-risk states.

## Important Limits

Epoch settlement reduces transaction count and public detail. It does not make all accounting invisible.

Operators still need monitoring and alerting. If epoch creation fails, the system should warn before users are affected.

## Technical Details

| Component | Role |
| --- | --- |
| `EpochAccount` | On-chain epoch state |
| PEA | Per-epoch reservoir |
| `PaymentCommitment` | Lightweight commitment account |
| Mempool backend | Builds roots and releases challenges |
| Cranker daemon | Races and executes work |
| Mempool explorer | Shows masked epoch status |
