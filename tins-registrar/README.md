# Transfer Identity Number System (TINS)

TINS is a production-ready identity protocol for private payments on Solana.

It gives each user a permanent 10-digit transfer identity and keeps the main wallet out of public identity resolution.

## What TINS Does

- issues permanent 10-digit transfer identity numbers
- supports human-readable identity mapping with privacy-first routing
- keeps main settlement wallet off-chain from public identity lookup
- enables multisig-secured wallet recovery and controlled wallet rotation
- prevents identity scraping through anti-enumeration generation

## Core Product Guarantees

### Identity Simplicity

- transfer identity works like an account number
- identity can be used across TrustLink and third-party integrators

### Wallet Privacy

- public lookup resolves identity metadata, not exposed main wallet path
- payment flows can route through escrow and private settlement systems

### Recovery Safety

- 2/3 multisig recovery model
- enforced cooldown for rotation operations

### Abuse Resistance

- anti-enumeration TIN generation
- protocol fee and rate limiting controls

## Security Status

| Feature | Status |
| --- | --- |
| Main wallet off-chain | Implemented |
| Privacy key derived (BIP-44) | Implemented |
| Display name verification | Implemented |
| Anti-enumeration TINs | Implemented |
| Multi-sig recovery (2/3) | Implemented |
| 24hr rotation cooldown | Implemented |
| Rate limiting | Implemented |
| Team fees | Implemented |

## Protocol Fees

| Action | Fee |
| --- | --- |
| Create TIN | 0.01 SOL |
| Rotate wallet | 0.005 SOL |
| Add recovery wallet | 0.002 SOL |

## Role in the Full Stack

TINS is the identity layer.

- TrustLink Pay is the user-facing app layer.
- TSN is the private settlement layer.
- TINS is the portable identity primitive that both can rely on.

## Integration Direction

Any Solana application can integrate TINS by:

1. resolving a TIN identity
2. creating payment routing intents
3. connecting settlement through private execution infrastructure

## Program Location

`C:\Users\codepara\Desktop\trust-link\tins-registrar`

## Positioning

TINS is designed to be reusable infrastructure, not app-specific identity storage.

It provides a stable, privacy-first transfer identity standard for Solana payments.
