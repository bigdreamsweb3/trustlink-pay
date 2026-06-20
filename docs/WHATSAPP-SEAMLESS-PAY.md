# WhatsApp In TrustLink Pay

WhatsApp is an optional communication and confidence layer.

It is not the core payment identity. The core payment identity is the TIN.

## What It Does

WhatsApp can help with:

- login and authentication flows
- payment notifications
- recipient confidence
- account recovery workflows
- social identity linking

## Why It Exists

Many users already trust WhatsApp as a communication channel.

Using it can make payment alerts and identity checks feel familiar, especially for mobile-first users.

## How It Fits With TINS

A WhatsApp number can be linked to a TIN.

When a sender resolves a TIN, the app may show safe WhatsApp-linked context if the user has allowed it and if the backend has verified it.

## Privacy Rules

- Do not expose phone numbers publicly by default.
- Do not store phone numbers as plaintext public protocol data.
- Use encrypted identity links where possible.
- Show whether a name came from TINS, TrustLink, or WhatsApp.

## Important Limits

WhatsApp should not be required for every payment.

TrustLink Pay should remain a TIN-first payment system. WhatsApp is a useful integration, not the identity foundation.
