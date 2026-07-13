# Developer Guide

This guide is for developers working on TrustLink Pay. TrustLink Pay gives developers a [payment protocol](../README.md) surface for identity-first blockchain payments on Solana.

## What Is This?

TrustLink Pay is a multi-part system:

- web frontend
- TrustLink backend
- Transfer Identity program and SDK
- TSN program and SDK
- Cranker daemon
- mempool backend
- mempool explorer

## Development Rule

Keep protocol logic in SDKs and programs.

The frontend should collect user input, connect Solana wallets exclusively through Reown AppKit, show status, and call SDK or backend APIs. It should not manually build TSN instructions or derive TSN program accounts.

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
npm --prefix tsn-protocol/tsn-sdk run build
npm --prefix frontend run typecheck
npm --prefix backend run typecheck
npm --prefix tsn-protocol/tsn-mempool-frontend run typecheck
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

## Public Route Discovery

Create indexable frontend pages inside `frontend/app/(public)/`. The frontend generates one public-route manifest from this folder and uses it for both the sitemap and robots metadata.

Run the generator directly when reviewing SEO route changes:

```bash
npm --prefix frontend run seo:generate
```

The frontend development, type-check, and build commands run the generator automatically. Dynamic routes are excluded so account-specific and transaction-specific URLs cannot enter the sitemap by accident.
