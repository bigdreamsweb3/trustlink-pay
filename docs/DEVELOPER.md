# Developer Guide

This guide is for developers working on TrustLink Pay.

## What Is This?

TrustLink Pay is a multi-part system:

- web frontend
- TrustLink backend
- TINS program and SDK
- TSN program and SDK
- Cranker daemon
- mempool backend
- mempool explorer

## Development Rule

Keep protocol logic in SDKs and programs.

The frontend should collect user input, connect wallets, show status, and call SDK or backend APIs. It should not manually build TSN instructions or derive TSN program accounts.

## Local Services

Common local ports:

| Service | Port |
| --- | ---: |
| Backend | 3000 |
| Frontend | 3001 |
| Mempool API | 8000 |
| Mempool UI | 3002 |

## Useful Commands

```bash
npm run dev:backend
npm run dev:frontend
npm run dev:tsn:stack
npm run tsn:cranker:start
```

## Build Commands

```bash
npm --prefix tsn-sdk run build
npm --prefix frontend run typecheck
npm --prefix backend run typecheck
npm --prefix tsn-mempool-frontend run typecheck
```

## Program Deploy Safety

Before deploying programs, run:

```bash
npm run deploy:doctor
```

This checks that the Solana, SBF, and Anchor versions are compatible with devnet deploys.

## Important Limits

Do not edit generated `dist/` files by hand. Change source files and rebuild.

Do not expose private routes, phone numbers, permit secrets, or decrypted payloads in logs or UI.
