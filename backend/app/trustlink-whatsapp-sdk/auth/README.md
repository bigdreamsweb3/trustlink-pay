# TrustLink WhatsApp Auth (Backend)

Auth-specific primitives used across the WhatsApp webhook and session flows:

- Session code format (`TLS` generated; `TL` accepted for legacy)
- WhatsApp auth message template: `Verify TrustLink Pay Code: <code>`
- Parser for extracting session codes from inbound message bodies

