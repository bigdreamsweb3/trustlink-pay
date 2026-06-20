# Security Philosophy

TrustLink Pay is designed around a simple rule:

```text
Do not make users regret using crypto for everyday payments.
```

## What This Means

Users should not need to understand raw wallet addresses, transaction graphs, or settlement internals before making a payment.

The product should help them answer basic questions:

- Am I paying the right person?
- Has the payment reached escrow?
- Has the recipient been paid?
- What should I do if something fails?

## Why This Matters

Crypto payments are powerful, but mistakes are expensive.

If a user sends to the wrong address or exposes a wallet that should have stayed private, the damage can be permanent. TrustLink Pay reduces these risks by making identity clearer and settlement less directly tied to public wallet graphs.

## Design Principles

### Identity First

Users should pay a TIN, not a raw wallet address.

### Clear Confirmation

Before a payment, the app should show the recipient name, verification status, and any warning about missing identity data.

### Separated Settlement

Sender funding and recipient payout should not be one obvious public path.

### Minimal Public Data

Public records should use commitments, roots, and masked status where possible.

### Operator Accountability

Crankers must be rewarded for valid work and penalized or restricted for bad work.

### Honest Limits

The product must not promise impossible privacy.

## What We Avoid

- raw wallet addresses as the normal identity
- unclear recipient screens
- private social data in public records
- endless retry loops that waste fees
- exposing full payment graphs in dashboards
- calling the system private when a public chain still shows activity

## The Practical Goal

TrustLink Pay should feel simple to users and defensible to engineers.

That means the user sees a clean payment flow, while the protocol keeps enough public proof for verification and enough private separation to avoid obvious tracking.

## External Discussions

Security improves when people outside the core team question assumptions and discuss the design in public.

See [Community Mentions](./MENTIONS.md) for external discussions and thoughtful public feedback about TrustLink Pay.
