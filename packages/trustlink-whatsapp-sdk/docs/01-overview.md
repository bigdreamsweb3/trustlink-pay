# Overview

The TrustLink WhatsApp SDK is a standalone package.

It helps an app use WhatsApp for:

- login session approval
- WhatsApp handoff links
- QR-code login flows
- payment notifications
- OTP messages
- phone-number confidence checks
- webhook processing
- opt-in and opt-out handling

## What The SDK Does

The SDK owns WhatsApp logic.

That includes:

- building WhatsApp URLs
- rendering WhatsApp UI helpers
- sending WhatsApp messages
- verifying webhook signatures
- reading webhook payloads
- detecting opt-in messages
- detecting stop messages
- processing session approval replies

## What The Host App Owns

The host app owns:

- user database
- payment database
- session-code storage
- auth token creation
- logging
- environment loading
- OTP policy
- frontend session notifications

The SDK connects to those systems through ports.

## Important Boundary

WhatsApp is not TIN ownership.

TIP is the Transfer Identity Protocol. TIN is the 10-digit Transfer Identity Number managed within TIP.

WhatsApp helps users communicate and approve actions, but WhatsApp does not control:

- wallet authority
- TIN ownership
- TSN settlement
- PRU derivation
- on-chain protocol authority
