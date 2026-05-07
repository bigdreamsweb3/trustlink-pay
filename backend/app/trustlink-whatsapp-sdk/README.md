# TrustLink WhatsApp SDK (Backend)

This module centralizes all WhatsApp integration code used by TrustLink:

- Auth (session codes + inbound parsing)
- Identity (opt-in / opt-out tracking via webhooks)
- Notifications (payment notices, receipts, lifecycle messages)
- Webhook processing + signature verification
- Number verification helpers

Other apps can reuse this folder as the WhatsApp auth/identity/notification layer.

