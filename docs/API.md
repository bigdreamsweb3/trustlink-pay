# API Guide

The TrustLink Pay backend provides application APIs. The TSN mempool backend provides settlement coordination APIs.

## What Is This?

This document explains what the APIs are for. It is not a full generated OpenAPI reference.

## Why APIs Exist

The frontend should not talk directly to every service.

The backend keeps user-facing records, authentication state, notifications, and payment history. The mempool backend coordinates TSN settlement work and exposes safe status views.

For TIN creation, upgrade, and update, the frontend talks directly to the TSN mempool backend. TrustLink backend must not sit in the middle of that protocol path.

## TrustLink Backend

The TrustLink backend handles:

- authentication
- identity records
- payment records
- wallet token lookups
- notification workflows
- status synchronization from TSN

It does not relay TSN protocol mutations on behalf of the frontend.

The frontend should use backend status for normal screens. It should not constantly poll Solana RPC for finalized payment states.

## TSN Mempool Backend

The mempool backend handles:

- pending payment intents
- Cranker work queues
- epoch records
- aggregate commitment roots
- minimal public challenge release
- PrivacyReceivePDA watch signals
- masked explorer data

It must not expose full private payment routes.

## Important API Rules

- Return clear statuses.
- Stop polling finalized payments.
- Mask recovery and privacy receive data in public views.
- Keep private payloads out of logs.
- Require worker/API keys for write operations.
- Use backend status records for user-facing payment history.

## Common Status Words

| Status | Meaning |
| --- | --- |
| `pending` | Waiting for Cranker validation |
| `escrowed` | Sender-side funds entered TSN escrow |
| `claiming` | Payout work is in progress |
| `executed` | Recipient payout succeeded |
| `failed` | Work reached a terminal failure |
| `canceled` | Work was rejected or expired |

## Technical Details

| Service | Path |
| --- | --- |
| TrustLink backend | `backend/` |
| TSN mempool backend | `tsn-mempool-backend/` |
| Frontend API proxy | `frontend/src/lib/api.ts` |
