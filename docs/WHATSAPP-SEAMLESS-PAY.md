# WhatsApp Notification Layer

WhatsApp is an optional notification surface for TrustLink Pay. It is not the payment protocol or the core identity system.

The protocol identity is the 10-digit Transfer Identity Number (TIN). A TIN is a unique number that identifies a user on the TrustLink network. WhatsApp simply delivers alerts and consent prompts about TIN-based payments.

## Correct Positioning

Use this framing:

```text
User pays a TIN. WhatsApp can notify the recipient.
```

Do not position the protocol as:

```text
User pays a WhatsApp number.
```

Phone numbers may be linked to TINs in the application layer, but the protocol should always be documented and integrated as TIN-first.

## How WhatsApp Fits In

WhatsApp supports these use cases:

- Transaction notifications
- Consent prompts
- Authentication support (OTP-style)
- Recipient reminders about pending claims
- Optional phone-to-TIN identity hints

None of these replace the TIN. They are application-layer conveniences.

## Optional Notification Flow

```
Sender enters recipient TIN
TrustLink creates TSN payment authorization
Cranker sponsors escrow
Recipient receives WhatsApp notification
Recipient opens TrustLink claim/status surface
TSN payout completes through vault settlement
```

## Compliance Rules

- Do not send unsolicited payment messages.
- Do not treat WhatsApp as custody or settlement infrastructure.
- Do not ask users for seed phrases or private keys.
- Do not describe WhatsApp as the payment protocol.
- Keep WhatsApp data separate from public TINS/TSN protocol data.
