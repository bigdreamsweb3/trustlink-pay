# TrustLink WhatsApp SDK (Monorepo Source)

This folder is the single source of truth for TrustLink's WhatsApp integration.

- `backend/`: server-side WhatsApp auth, messaging, webhooks, number verification, DB helpers
- `frontend/`: client-side WhatsApp auth helpers, QR rendering, and UI components (modal, etc.)

The TrustLink apps in `backend/` and `frontend/` consume this SDK via lightweight re-export shims.

