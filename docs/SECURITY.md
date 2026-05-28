# TrustLink Pay Security

This document describes the current security model for TrustLink Pay, TINS, and TSN.

## Core Principles

- The backend verifies phone ownership through WhatsApp authentication.
- TINS verifies wallet ownership of a Transfer Identity Number.
- TSN verifies settlement state through Solana accounts and cranker execution.
- The backend does not custody user funds.
- The frontend must make payment and identity state visible to users.

## TINS Identity Security

The active TINS flow creates a wallet-owned identity PDA.

Backend acceptance requires:

1. Authenticated TrustLink session.
2. Valid TINS program id: `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT`.
3. TINS identity PDA derived from the submitted wallet.
4. Existing on-chain TINS account owned by the TINS program.
5. Decoded on-chain TIN matching the submitted TIN.
6. Fresh wallet signature over the phone-to-TIN binding message.

The phone number is encrypted before it is submitted to TINS. The TrustLink backend stores the phone number -> TIN mapping because WhatsApp phone ownership is an application-layer fact.

## Public And Private Data

| Data | Location | Visibility |
| --- | --- | --- |
| Phone number | TrustLink backend | Private application data |
| TIN | TINS account and TrustLink backend | Public identifier |
| Display name | TINS account | Public |
| TINS identity PDA | TINS account | Public |
| Encrypted phone payload | TINS account | Public ciphertext |
| Wallet binding signature | TrustLink backend | Private application record |
| Payment state | TrustLink backend and TSN | User-facing state |

The current TINS identity PDA is derived from the wallet public key. It does not store the wallet as a `TinAccount` field, but an observer who already knows a wallet can derive and check its TINS PDA. Do not describe this as full wallet unlinkability.

## Payment Security

Payment creation follows this chain:

```text
authenticated sender
recipient phone resolves to TIN
recipient TINS mapping verified
sender signs payment
backend records payment
TSN intent enters mempool
cranker submits eligible work
backend and frontend track state
```

The UI must not present a newly created payment as final settlement. Before cranker/on-chain submission, it should show a processing state with the current step.

## Cranker Security

Crankers should only process eligible intents. A claim request should not appear just because the backend created a payment record. Claim work becomes valid after the proper TSN intent state exists.

Operator requirements:

- registered cranker identity
- configured TSN program id
- configured TINS program id
- funded vaults for supported token mints
- Solana devnet RPC access

## Threats And Mitigations

| Threat | Mitigation |
| --- | --- |
| Phone account takeover | WhatsApp auth, session checks, wallet binding signature |
| Fake TIN submitted to backend | Backend Solana RPC verification and PDA derivation check |
| TIN mapped to wrong wallet | Wallet-signed binding message includes phone, TIN, wallet, identity PDA, program id, and timestamp |
| Stale binding replay | Five-minute binding signature age limit |
| Wrong TINS program id | Backend validates configured/default TINS program id |
| Incorrect payment finality UX | Dashboard and payment details show processing stages |
| Cranker bypass | TSN state and cranker registration gates settlement work |

## Verification Checklist

- [ ] Backend `.env.local` has the correct `TINS_PROGRAM_ID`.
- [ ] Frontend `.env.local` has the correct `NEXT_PUBLIC_TINS_PROGRAM_ID`.
- [ ] TSN cranker environment has both TSN and TINS program ids.
- [ ] `/api/identity/tin` rejects invalid PDA, invalid owner, invalid TIN, stale signature, and invalid signature.
- [ ] Dashboard displays the TIN instead of treating WhatsApp as the settlement identity.
- [ ] Payment history shows processing state until TSN/cranker state advances.

