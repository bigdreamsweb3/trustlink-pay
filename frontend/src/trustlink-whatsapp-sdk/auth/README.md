# TrustLink WhatsApp Auth (Frontend)

This folder contains TrustLink-owned frontend helpers for WhatsApp session auth:

- Message template: `Verify TrustLink Pay Code: <code>`
- URL builders for `whatsapp://` and `https://api.whatsapp.com/send/...`

UI components (modals, screens) should import from `@/src/trustlink-whatsapp-sdk/auth`.
