# TSN Commitment Settlement

TSN means **Transfer Settlement Network**.

It is the layer that separates sender funding from recipient payout.

## What Is This?

Commitment settlement is the current TSN settlement model.

Instead of putting every private payment detail in public accounts, the system records small public commitments. A commitment is a hash that proves a record exists without revealing the full route.

## Why It Exists

If every payment is a direct transfer, the chain can show a clear path:

```text
sender wallet -> recipient wallet
```

TSN breaks that path into separate steps:

```text
sender authorization -> escrow -> vault payout -> epoch accounting
```

This gives the user a normal payment experience while reducing how much of the payment graph is easy to follow.

## How It Works

### PaymentCommitment

A `PaymentCommitment` is a lightweight on-chain record.

It stores the minimum public data needed to prove settlement work happened. It should not store the full private route, recipient social identity, or plaintext token.

### PEA Reservoir

Each epoch has a PEA reservoir.

The PEA keeps funds and accounting for one epoch isolated from other epochs. This makes recovery and reimbursement easier to reason about.

### Aggregate Root

The mempool backend aggregates private payment commitments into a root hash.

That root is a compact proof of the epoch's commitment set.

### Minimal Public Challenge

When an epoch needs settlement, the system releases only the minimum challenge data required for Crankers to compete.

The challenge should contain aggregate values, roots, and identifiers. It should not expose raw payment routes.

### PrivacyReceivePDA

A PrivacyReceivePDA is a receive-side route used to watch for funds that should be swept or settled.

The mempool can monitor these routes and signal when sweep work is needed. The public explorer should mask this information.

## Example Flow

1. A payment is authorized.
2. A Cranker validates it.
3. The sender-side escrow is funded.
4. A `PaymentCommitment` is opened.
5. The recipient payout happens from vault liquidity.
6. The commitment is included in the epoch aggregate root.
7. At epoch settlement, Crankers race to process the challenge.
8. Valid work updates recovery or reimbursement state.

## Security Considerations

- Commitments must be domain-separated so one hash cannot be reused for another purpose.
- Public challenge data must stay minimal.
- Crankers must validate signatures, amounts, tokens, epochs, and routes before acting.
- Duplicate settlement and replay must be rejected.
- Recovery must not expose the full payment graph.

## Important Limits

Commitments do not hide the fact that program activity happened.

They reduce the amount of private payment detail placed in public state.

## Technical Details

| Concept | Implementation |
| --- | --- |
| Commitment account | `PaymentCommitment` |
| Epoch account | `EpochAccount` |
| Reservoir | PEA |
| Challenge source | TSN mempool backend |
| Explorer display | masked epoch/challenge cards |
| Program workspace | `tsn/protocol/` |
