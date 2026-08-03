# Metadata use and compliance

TrustLink Pay uses metadata to make identity-first payments understandable and
auditable without exposing unnecessary private information.

## What metadata means

Metadata is information about an identity or payment that is separate from the
token transfer itself, including:

- TIN;
- display name;
- verification status;
- payment status;
- notification channel;
- masked route or commitment reference.

## Data principles

### Minimize public data

Show only the information required to confirm who is being paid, what state the
payment is in, and whether the result is complete. Do not expose full private
routes, decrypted ZK-PRU material, device secrets, or unnecessary wallet links.

### Protect identity context

Phone numbers, WhatsApp identities, email addresses, social profiles, and legal
identity attributes are enrichment data, not the protocol identity itself. A
TIN is the payment identity. Sensitive identity context must be encrypted or
access-controlled before storage and requires explicit authorization before
decryption.

### Separate status from secrets

The UI may display safe states such as `PENDING`, `FUNDED`, `SETTLED`, or
`FAILED`, plus a commitment or masked route reference. It must not display
plaintext seed material, child private keys, secret-key arrays, recovery
phrases, or decrypted private balances.

### Consent and retention

Collect metadata only for a defined payment, identity, notification, support,
or compliance purpose. Retain it only as long as that purpose requires, and
honor user-controlled revocation where the product and applicable law require
it.

This document describes project data principles, not legal advice. Launches
must receive jurisdiction-specific review.
