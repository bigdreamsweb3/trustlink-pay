# TSN

TSN means **Transfer Settlement Network**.

## What Is This?

TSN is the settlement layer for TrustLink Pay.

It separates sender funding from recipient payout and records verifiable commitments instead of exposing full private payment routes.

## Why It Exists

Direct transfers expose a simple graph:

```text
sender wallet -> recipient wallet
```

TSN breaks that graph into settlement stages.

## Main Parts

| Part | Purpose |
| --- | --- |
| `protocol/` | Solana program workspace |
| `tsn-sdk/` | SDK used by apps and services |
| `tsn-cranker-op-daemon/` | Reference operator daemon |
| `tsn-mempool-backend/` | Mempool and epoch coordination |
| `tsn-mempool-frontend/` | Explorer for safe settlement status |

## Read More

- `docs/TSN-COMMITMENT-SETTLEMENT.md`
- `docs/EPOCH-SETTLEMENT.md`
- `docs/CRANKER.md`
