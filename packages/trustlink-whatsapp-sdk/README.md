# TrustLink WhatsApp SDK

This package supports WhatsApp-based TrustLink workflows.

## What Is This?

It contains helpers for WhatsApp authentication, notifications, and identity confidence flows.

## Why It Exists

WhatsApp is familiar to many users.

TrustLink Pay can use it to send alerts, support recovery flows, and help users confirm that a TIN belongs to the expected person or business.

## Important Rule

WhatsApp is not the protocol identity.

The protocol identity is the TIN. WhatsApp is an optional communication and confidence layer.

## Privacy Rules

- Do not expose phone numbers publicly by default.
- Do not store phone numbers in public protocol accounts.
- Clearly label WhatsApp-sourced names.
- Prefer encrypted identity links.

## Related Docs

- `docs/WHATSAPP-SEAMLESS-PAY.md`
- `docs/META-DATA-USE-COMPLIANCE.md`
