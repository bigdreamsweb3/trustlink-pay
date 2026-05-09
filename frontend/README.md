# TrustLink Pay Frontend

The frontend is the mobile-first app for sending and claiming TrustLink payments.

It runs on Next.js 15 and talks to the backend on port `3000` during local development.

## Main Screens

- Send: enter phone number, verify recipient, choose token, lock funds in escrow.
- Claim: verify receiver, connect wallet, enter PIN, request settlement.
- Wallets: manage receiver wallets.
- Activity: view payment history and details.
- Settings: manage identity, PIN, recovery, and autoclaim.

## TSN Behavior

When `TSN_ENABLED=true` on the backend:

- the send page keeps using the same create-payment flow
- the backend creates a TSN payment intent after escrow confirmation
- the claim page sends a claim request instead of forcing a direct escrow release transaction
- the UI shows that a Cranker will settle the claim

When TSN is disabled, the claim page keeps the older direct claim transaction flow.

## Local Setup

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3001
```

Use `NEXT_PUBLIC_BACKEND_URL=http://localhost:3000` if the middleware proxy is not available.

## Frontend Contract

The claim page accepts two backend response modes from `POST /api/payment/accept`:

- `blockchainMode: "devnet" | "mock"` means the receiver signs a prepared transaction.
- `blockchainMode: "tsn"` means the backend created a DB claim request and the receiver waits for Cranker settlement.

This keeps the app usable during the M4 migration while the old direct-claim path remains available.
