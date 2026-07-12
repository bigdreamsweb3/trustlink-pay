# TrustLink WhatsApp SDK

Standalone WhatsApp SDK for TrustLink authentication, session approval, notifications, number checks, and webhook handling.

WhatsApp is not the protocol identity. TIN is the protocol identity. WhatsApp is only a communication and confirmation layer.

## Docs

Read in this order:

1. Overview: docs/01-overview.md
2. Install And Build: docs/02-install-and-build.md
3. Frontend Usage: docs/03-frontend-usage.md
4. Backend Setup: docs/04-backend-setup.md
5. Webhooks: docs/05-webhooks.md
6. Messaging: docs/06-messaging.md
7. Session Flow: docs/07-session-flow.md
8. Security: docs/08-security.md

## Quick Commands

Install and build the SDK:

    npm --prefix packages/trustlink-whatsapp-sdk install
    npm --prefix packages/trustlink-whatsapp-sdk run build

For TrustLink frontend development:

    npm run sdk:sync:frontend
    npm run frontend:dev:synced
