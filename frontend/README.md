# TrustLink Frontend

The frontend is the user-facing TrustLink Pay app.

## What Is This?

It lets users create or view a TIN, resolve recipients, send payments, track payment status, and manage identity settings.

## Why It Exists

The protocol is complex. The app should make it feel simple.

A user should understand:

- who they are paying
- whether the payment is pending
- whether funds are escrowed
- whether the recipient has been paid
- whether an identity is verified or missing verification

## Responsibilities

- Collect user input.
- Connect wallets.
- Display identity and payment status.
- Call backend APIs.
- Call SDK methods where client-side protocol interaction is required.

## Important Rules

- Do not manually build TSN program instructions in React components.
- Do not expose private settlement payloads.
- Do not display a full TIN in cramped activity cards if a shortened form is safer for layout.
- Show full identity details only in the proper identity or transaction detail surfaces.
- Use backend status for finalized payment states.

## Local Development

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Default local port:

```text
http://localhost:3001
```
