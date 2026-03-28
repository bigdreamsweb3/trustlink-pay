# TrustLink Pay Backend

The backend is the operational core of TrustLink. It handles identity, consent, OTP issuance, payment creation, recipient lookup, WhatsApp webhooks, notification retries, and the Solana escrow workspace.

## What This Backend Actually Does

### Phone-First Authentication

TrustLink no longer starts with email or a traditional password flow.

Current auth sequence:

1. user enters a WhatsApp number
2. if the number is not opted in, TrustLink opens a prefilled `START TRUSTLINK` WhatsApp message
3. inbound webhook marks the number as opted in
4. backend creates an `auth` OTP
5. OTP verification returns an app challenge
6. the app requires PIN setup or PIN verification before use

Users can opt out with `STOP`, and the backend records that state.

The backend also supports OTP-gated PIN change so a user must confirm a fresh WhatsApp code before updating their in-app PIN.

### Recipient Handling

The backend now distinguishes carefully between:

- registered and opted-in recipients
- unregistered or not-opted-in recipients

For registered recipients:

- identity preview is returned to the sender
- WhatsApp payment notifications can be sent
- message delivery status can be tracked

For unregistered recipients:

- no automatic WhatsApp business message is sent
- backend returns a sender-written invite message for manual sharing

This is the current compliance-safe notification model.

### Payment Lifecycle

The backend handles:

- payment creation
- escrow metadata persistence
- reference generation
- sender and receiver view shaping
- claim OTP start
- release acceptance state
- sender-fee and claim-fee estimation
- expiry sweep orchestration
- transaction detail payloads
- manual invite regeneration payloads for sender follow-up

### Notification State

For outbound WhatsApp notifications, TrustLink stores and updates:

- `queued`
- `sent`
- `delivered`
- `read`
- `failed`

The frontend reads this state from TrustLink's database. It does not need to query WhatsApp directly on page load.

### Gasless Payment Handling

TrustLink users do not need SOL for normal send and claim flow.

The backend:
- estimates live Solana transaction cost
- pays network fees through the verifier wallet
- charges sender-side fees in the token being sent
- charges claim-side fees in the token being claimed
- reclaims recoverable SOL rent when escrow vaults close

## Main Areas

- `app/api`
  - route handlers for auth, payments, profiles, webhooks, wallets, and claim flow
- `app/services`
  - business logic for auth, recipient resolution, payment orchestration, WhatsApp messaging, and viewer-safe transaction shaping
- `app/db`
  - schema and query layer
- `app/blockchain`
  - Solana integration helpers
- `programs/trustlink-escrow`
  - Anchor escrow program workspace
- `scripts`
  - local setup and backend test utilities

## Important Backend Behaviors

### Webhook-Driven Opt-In

The backend does not poll WhatsApp for inbound messages. It relies on Meta webhooks delivered to the TrustLink webhook route. If the webhook URL is stale, opt-in and OTP flows will stall.

### OTP Timing

OTP expiry is generated using the database clock, not the application clock. This avoids the server/database time drift bug that previously caused valid OTPs to appear expired immediately.

### Notification Retry Strategy

If a payment is created successfully but the WhatsApp notification fails:

- the payment still remains valid in escrow
- the sender should still receive a successful payment state
- backend retries eligible queued or failed notifications using stored DB state and cooldown rules

### Privacy Rules

The backend shapes transaction views so that normal receivers do not get the sender's wallet address by default. Sensitive fields stay internal unless specifically required for authorized review.

## Local Setup

```bash
npm install
npm run db:init
npm run dev
```

## Useful Scripts

```bash
npm run db:init
npm run db:reset
npm run escrow:init-config
npm run escrow:update-config
npm run escrow:expire-payments
npm run test:payment-flow
npm run test:auth-phone-flow
```

## Related Docs

- [Devnet testing guide](C:/Users/codepara/Desktop/trust-link/docs/devnet-testing.md)
- [Wallet roles](C:/Users/codepara/Desktop/trust-link/docs/wallet-roles.md)
- [Escrow V2 design](C:/Users/codepara/Desktop/trust-link/docs/escrow-v2-design.md)
- [Payment escrow architecture](C:/Users/codepara/Desktop/trust-link/docs/payment-escrow-architecture.md)

### `test:auth-phone-flow`

Exercises the current phone-first auth path:

- start auth
- inspect auth OTP persistence
- check auth status
- verify the exact stored OTP

### `test:payment-flow`

Exercises the payment and claim flow utilities used during local development.

## Environment Notes

Sensitive values belong only in local env files or deployment secrets:

- `DATABASE_URL`
- `SESSION_SECRET`
- `WHATSAPP_API_KEY`
- `WHATSAPP_PHONE_ID`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- Solana program and authority values

Token allowlisting for real escrow tests is configured by mint address, not symbol:

- `SOLANA_ALLOWED_SPL_TOKENS`

Escrow verifier and fee recovery are configured centrally through:

- `app/config/escrow.ts`

Important values:

- `SOLANA_CLAIM_VERIFIER_SECRET_KEY`
- `TRUSTLINK_TREASURY_OWNER`
- `TRUSTLINK_SEND_FEE_BPS`
- `TRUSTLINK_SEND_FEE_MAX_UI_AMOUNT`
- `TRUSTLINK_CLAIM_FEE_BPS`
- `TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT`
- `TRUSTLINK_DEFAULT_EXPIRY_SECONDS`
- `TRUSTLINK_RECOVERY_WALLETS`

See:

- [`docs/devnet-testing.md`](../docs/devnet-testing.md)
- [`docs/wallet-roles.md`](../docs/wallet-roles.md)

Never commit environment files or private keys.

## Current Backend Status

This backend currently supports:

- WhatsApp opt-in and opt-out tracking
- phone-first OTP auth
- PIN setup and PIN verify challenge flow
- OTP-gated PIN change flow
- manual invite generation for unregistered recipients
- sender notification receipt state
- viewer-safe transaction detail responses
- live escrow-backed payment creation and release
- gasless send and claim support through the verifier wallet
- expiry sweep support for unclaimed payments
