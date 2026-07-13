# TrustLink Backend

The backend supports the TrustLink Pay app.

## What Is This?

This service stores application records and exposes APIs used by the frontend.

It is not the TSN settlement program and it does not replace the TSN mempool.

## Why It Exists

The frontend needs a reliable source for user-facing state:

- login status
- identity records
- payment records
- notification state
- payment history
- status synchronization

The backend keeps this app state separate from protocol settlement state.

## Responsibilities

- Authenticate users.
- Store TrustLink profile data.
- Store payment records.
- Track payment status from TSN.
- Send or coordinate notifications.
- Expose frontend-safe APIs.

## Important Rules

- Do not store decrypted private TSN payloads.
- Do not expose raw private routes.
- Stop polling finalized payments.
- Treat TSN and TIP as protocol systems accessed through SDKs and APIs.

## Local Development

```bash
npm --prefix backend install
npm --prefix backend run dev
```

Default local port:

```text
http://localhost:3000
```
