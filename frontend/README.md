# TrustLink Pay Frontend

The frontend is the mobile-first TrustLink app experience for senders and receivers. It is designed around WhatsApp-number identity, escrowed payments, OTP-based claim confirmation, and compact transaction clarity.

## What The Frontend Does Now

### Phone-First Entry

The app starts with a WhatsApp-number flow instead of a traditional email/password form.

Current UX:

1. user enters a WhatsApp number
2. if opt-in is missing, the app opens a prefilled `START TRUSTLINK` WhatsApp message
3. the app waits for the webhook-backed opt-in state
4. once OTP is ready, the modal opens automatically
5. after OTP success, the app redirects into the in-app PIN gate

### In-App PIN Gate

PIN setup and PIN verification happen inside the app area, not on the public auth screen.

That means:

- successful OTP does not immediately unlock the app
- the app shell blocks interaction until the correct 6-digit PIN is created or entered

### Send Flow

The send experience now:

- waits for a full local phone number before starting recipient verification
- shows TrustLink identity when a recipient is known
- supports manual invite flow for unregistered recipients
- creates escrow-backed payments
- shows compact WhatsApp-style delivery indicators for eligible notifications

### Receive and Claim Flow

The receive side includes:

- pending payment list
- claim start and OTP confirmation
- receiver wallet selection
- claim release confirmation

### Activity and Transaction Detail

Transactions are no longer just list items. The frontend now includes full detail screens with viewer-safe information for:

- sender
- receiver
- claimer

## UX Rules Reflected In The Frontend

### Registered Recipient

If the recipient is a registered, opted-in TrustLink user:

- TrustLink can show identity preview
- TrustLink can send the business WhatsApp notification
- sender sees receipt indicators in-app

### Unregistered Recipient

If the recipient is not registered or not opted in:

- the app does not pretend a WhatsApp business message was sent
- the sender gets a generated personal invite message
- the app offers device share or copy flow so the sender shares it manually

### Notification Indicators

The frontend now uses a compact WhatsApp-style indicator instead of long text labels:

- single tick for sent
- double tick for delivered
- highlighted double tick for seen

## Main Frontend Areas

- `app`
  - routes and app pages
- `src/components`
  - send, receive, auth, claim, dashboard, activity, and transaction detail UI
- `src/lib`
  - API utilities, types, storage helpers, and session helpers

## Local Setup

```bash
npm install
npm run dev
```

The frontend runs on port `3001` and talks to the backend through the configured local backend path.

## Design Direction

The current design goals are:

- clear identity before money movement
- mobile-first interaction patterns
- compact but traceable transaction feedback
- less text-heavy notification state
- strong separation between auth, PIN gating, send, claim, and history

## Current Frontend Status

The frontend currently includes:

- phone-first auth UX
- webhook-aware waiting state for WhatsApp opt-in
- OTP modal flow
- in-app PIN setup and PIN verification gate
- recipient preview before send
- manual invite sharing for unregistered numbers
- sender receipt-state indicators
- full transaction detail views

## Notes

- Local storage is used for pending auth challenge state between OTP and PIN flow.
- Public-safe assets should live in the repository-level `public/` folder, not inside frontend secrets or config.
