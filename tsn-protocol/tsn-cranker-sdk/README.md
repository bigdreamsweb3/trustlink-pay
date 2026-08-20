# TSN Cranker SDK

The Cranker SDK provides helper tools for Cranker operators.

## What Is This?

It wraps common operator actions such as registration, setup, vault funding, and epoch work.

## Why It Exists

Cranker operation should be repeatable.

Operators should not manually rebuild every TSN instruction or guess which PDA is required.

## Responsibilities

- Provide operator CLI helpers.
- Derive Cranker and TSN PDAs.
- Submit setup transactions.
- Support epoch treasury and opaque-slot settlement workflows.
- Share common code with the reference daemon.

## Development

```bash
npm --prefix tsn-cranker-sdk install
npm --prefix tsn-cranker-sdk run build
```

## Related Docs

- `docs/CRANKER.md`
- `docs/EPOCH-SETTLEMENT.md`
