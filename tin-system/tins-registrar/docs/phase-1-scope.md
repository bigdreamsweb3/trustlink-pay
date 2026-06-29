# TINS Scope

TrustLink Pay is pre-launch, so this document describes the active scope instead of old phases.

## Active Scope

TINS should provide:

- 10-digit payment identity creation
- TIN lookup
- SHA-256 owner pubkey commitment tracking
- public name or missing-name status
- encrypted social identity records
- sensitive encrypted fields that require user authorization
- registered verification platform keys
- platform-signed identity proofs

## Out Of Scope For Core TINS

TINS should not become a general social network.

It should not publish phone numbers, private documents, or full wallet history. It should provide enough identity context for safer payments.

## Product Rule

The payment identity is the TIN.

Phone numbers and WhatsApp links can help with confidence and notifications, but they are not the protocol identity.
