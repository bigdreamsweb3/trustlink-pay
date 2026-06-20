# TSN SDK

The TSN SDK is the application interface to the Transfer Settlement Network.

## What Is This?

Apps and services use this SDK to interact with TSN.

The SDK should be the place where TSN transaction construction, PDA derivation, authorization helpers, quote helpers, and settlement calls live.

## Why It Exists

Frontend apps should not need to understand TSN internals.

They should call SDK methods instead of manually building instructions or deriving program accounts.

## Responsibilities

- Resolve TSN routes.
- Build TSN transactions and instructions.
- Derive TSN PDAs.
- Create payment authorization payloads.
- Submit mempool work.
- Read settlement status.
- Support TINS resolution where TSN needs identity context.
- Expose safe helpers for Cranker and backend services.

## Important Rules

- Do not move TSN transaction-building logic into React components.
- Do not expose private settlement payloads in logs.
- Keep browser-safe and server-only APIs clearly separated.
- Rebuild the SDK after changing source files.

## Development

```bash
npm --prefix tsn-sdk install
npm --prefix tsn-sdk run build
```

## Related Docs

- `docs/TSN-COMMITMENT-SETTLEMENT.md`
- `docs/INTEGRATION.md`
- `docs/CRANKER.md`
