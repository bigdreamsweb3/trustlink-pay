# Security

The WhatsApp SDK is a communication and confirmation layer.

It is not the protocol identity layer.

It is not a wallet.

It is not a signer.

It is not a settlement authority.

## Main Security Rules

WhatsApp must never control:

- TIN ownership
- wallet authority
- PRU derivation
- TSN settlement
- on-chain protocol authority

## Keep Secrets Server-Side

These values must stay server-side:

- WHATSAPP_API_KEY
- WHATSAPP_APP_SECRET
- auth challenge secrets
- session-code storage
- database credentials

Frontend code must never receive WhatsApp API secrets.

## Verify Webhook Signatures

Always verify Meta webhook signatures before processing the payload.

Use:

    verifyWhatsAppSignature(rawBody, signatureHeader)

The raw body must be the exact request body received from Meta.

Do not parse JSON before signature verification.

## Phone Number Privacy

Phone numbers are private user data.

Do not store phone numbers in public protocol accounts.

Do not put phone numbers into:

- Solana account data
- public transaction memos
- public registry records
- public logs
- analytics events

Use private backend storage.

Use hashes only when lookup does not require plaintext.

## Message Logging

Do not log:

- OTP codes
- challenge tokens
- WhatsApp API keys
- full phone numbers
- private session payloads

Logs should be useful for debugging without exposing user secrets.

## WhatsApp Names Are Not Identity Proof

WhatsApp profile names can help users recognize contacts.

They are not legal identity.

They are not TIN ownership proof.

They are not payment authority.

## Session Approval Limits

A WhatsApp session approval can approve a backend login or action flow.

It must not directly:

- create a TIN
- upgrade a TIN
- spend funds
- move stablecoins
- derive PRUs
- expose PRU keys
- authorize TSN settlement

Those flows must still follow the correct TrustLink protocol path.

## Opt-In And Opt-Out

Users must be able to opt in and opt out of WhatsApp messages.

The SDK recognizes:

    START TRUSTLINK
    STOP

Notifications should respect opt-in status.

## Adapter Safety

The host app must configure SDK ports before using backend functions.

If ports are missing, the SDK should fail loudly.

Do not silently fall back to fake storage or in-memory production behavior.

## TrustLink Boundary

TIN is the identity.

TSN is the settlement network.

PRU is the privacy receiving unit.

WhatsApp only helps users communicate, confirm, and receive notifications.
