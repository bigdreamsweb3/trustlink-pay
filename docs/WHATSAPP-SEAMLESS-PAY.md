# WhatsApp And Social Notification Layer

WhatsApp is an application-layer support surface for TrustLink Pay.

It is useful for:

- notifications,
- consent prompts,
- authentication support,
- recipient reminders,
- optional social identity linking.

It is not the core payment identity.

The protocol identity is the 10-digit TIN.

---

## Correct Positioning

Use this framing:

```text
User pays a TIN. WhatsApp can notify the recipient.
```

Do not position the protocol as:

```text
User pays a WhatsApp number.
```

Phone numbers may be linked to TINs in the application layer, but the protocol should be documented and integrated as TIN-first.

---

## Optional Flow

```text
Sender enters recipient TIN
TrustLink creates TSN payment authorization
Cranker sponsors escrow
Recipient receives WhatsApp notification
Recipient opens TrustLink claim/status surface
TSN payout completes through vault settlement
```

---

## Future Social Identity Direction

TrustLink may later support:

- phone-to-TIN discovery,
- WhatsApp payment reminders,
- X account to TIN verification,
- business profile to TIN verification,
- merchant notification flows.

All of these should point back to the same TIN identity.

---

## Compliance Rules

- Do not send unsolicited payment messages.
- Do not treat WhatsApp as custody or settlement infrastructure.
- Do not ask users for seed phrases or private keys.
- Do not describe WhatsApp as the payment protocol.
- Keep WhatsApp data separate from public TINS/TSN protocol data.
