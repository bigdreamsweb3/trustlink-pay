# TSN Cranker Operator Daemon

The Cranker daemon is the reference settlement operator for TSN.

## What Is This?

It watches the TSN mempool and performs valid settlement work.

## Why It Exists

TSN separates sender funding from recipient payout. Crankers keep that separated settlement flow moving.

## Responsibilities

- Monitor pending payment intents.
- Validate signatures, routes, epochs, amounts, and expiry.
- Reject tampered work.
- Submit escrow and settlement work.
- Execute vault payouts.
- Watch epoch challenges.
- Participate in recovery or reimbursement races.
- Quarantine permanent failures instead of retrying forever.

## Local Operation

```bash
npm --prefix tsn-cranker-op-daemon install
npm run tsn:cranker:register
npm run tsn:cranker:start
```

## Security Rules

- Keep operator keys private.
- Do not log decrypted settlement payloads.
- Do not expose private routes in terminal output.
- Treat repeated simulation failures as quarantine candidates.

## Related Docs

- `docs/CRANKER.md`
- `docs/LIQUIDITY.md`
- `docs/EPOCH-SETTLEMENT.md`
