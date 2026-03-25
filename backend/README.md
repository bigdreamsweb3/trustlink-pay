# TrustLink Pay Backend

The backend is the private application layer for TrustLink Pay. It orchestrates the product logic that makes phone-number-based crypto payments feel safe, traceable, and familiar.

## What Lives Here

- Next.js App Router backend services
- WhatsApp Business API integration
- Neon/Postgres data access
- authentication and OTP flows
- payment lifecycle orchestration
- Solana integration and Anchor escrow workspace

## Responsibilities

- register and authenticate users with WhatsApp-linked identity
- generate and track payment intents
- resolve recipient identity previews
- send WhatsApp payment and claim notifications
- verify claim flows before releasing funds
- store references, statuses, and audit-friendly event history

## Main Areas

- `app/api`
  - route handlers and API surface
- `app/services`
  - business logic orchestration
- `app/db`
  - schema and database access
- `app/blockchain`
  - Solana integration
- `programs/trustlink-escrow`
  - Anchor escrow program workspace
- `scripts`
  - local setup and testing utilities

## Run Locally

```bash
npm install
npm run db:init
npm run dev
```

Optional test flow:

```bash
npm run test:payment-flow
```

## Important Notes

- This folder contains hackathon/private backend code and should not expose secrets.
- `.env` and local environment files are ignored by Git.
- Build output, escrow artifacts, and local caches are also ignored.
