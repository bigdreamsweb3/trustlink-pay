# TrustLink Pay Operator Guide

## Running a Cranker Node

Crankers execute payments and earn from settlement volume.

## Requirements

- Solana wallet (funded)
- Server with public IP
- Redis for state
- Node.js 20+

## Setup

### 1. Install SDK

```bash
cd tsn/cranker-sdk && npm install
```

### 2. Configure

```bash
export WALLET_PRIVATE_KEY="[base58]"
export REDIS_URL="redis://localhost:6379"
export VERIFIER_PDA="7xKX..."
export NETWORK="devnet"  # or mainnet
```

### 3. Register Cranker

```bash
npm run register \
  -- --wallet-key "$WALLET_PRIVATE_KEY" \
  --network devnet
```

### 4. Start Node

```bash
npm run cranker start
```

## Monitoring

Dashboard available at `http://localhost:3002/dashboard`

## Commands

| Command | Description |
| --- | --- |
| `start` | Begin processing intents |
| `stop` | Graceful shutdown |
| `status` | Check node health |
| `stats` | View performance |

## Performance Metrics

- Processed: Number of intents executed
- Pending: Intents awaiting lease
- Reimbursed: Total epoch reimbursements

## Epoch Reimbursement

Crankers receive reimbursement every 7 hours. Configure your epoch settings in `tsn/config.yaml`.

## Troubleshooting

### "Unable to acquire lease"

- Another Cranker is faster
- Increase monitoring frequency

### "Insufficient verifier funds"

- Contact TrustLink to top up verifier PDA

### "Redis connection failed"

- Check Redis is running
- Verify REDIS_URL