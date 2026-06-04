# TINS - Transfer Identity Number System

TINS is the identity layer of TrustLink Pay.

It gives a user a permanent 10-digit Transfer Identity Number that can be shared instead of a wallet address.

```text
TIN -> identity PDA -> settlement route
```

The TIN is the protocol-facing receive identity. Phone numbers and social accounts can be linked later as optional discovery and trust signals.

---

## Program

| Network | Program ID |
| --- | --- |
| Devnet | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |

The TSN settlement program is separate:

```text
TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
```

---

## Identity Model

### Global State

PDA seed:

```text
global-state
```

| Field | Purpose |
| --- | --- |
| `version` | TINS account version |
| `bump` | PDA bump |
| `next_sequence` | Next numeric TIN sequence |

### TIN Identity Account

PDA seed:

```text
identity, sha256(wallet_pubkey || TINS_SALT_2026)
```

| Field | Purpose |
| --- | --- |
| `tin` | Numeric Transfer Identity Number |
| `display_name` | Public name shown to senders |
| `identity_pubkey` | TINS identity PDA |
| `encrypted_phone` | Optional encrypted application payload |
| `created_at` | On-chain creation timestamp |

### Registry PDA

PDA seed:

```text
registry, tin.to_le_bytes()
```

The registry address allows TIN-based lookup and compatibility with wallet/app integrations.

---

## What TINS Enables

TINS can be used by:

- TrustLink Pay for TIN-first stablecoin payments,
- wallets that want receive identities instead of raw addresses,
- merchants that want safer customer-facing payment identifiers,
- apps that want private settlement routes through TSN,
- future social identity providers that map trust signals to TINs.

The core rule is simple:

```text
Users share TINs. Protocols resolve settlement routes.
```

---

## Privacy Position

TINS is not a claim that all identity data is invisible.

TINS reduces address exposure by moving the user-facing receive identity away from raw wallet addresses. TSN then completes the privacy design by separating sender-side escrow from recipient-side payout.

Public data may include:

| Data | Public? | Notes |
| --- | --- | --- |
| TIN | Yes | Public receive identity |
| Display name | Yes | Helps sender confirm recipient |
| TINS identity PDA | Yes | Program-owned identity account |
| Optional encrypted payload | Yes | Public ciphertext, not plaintext |
| Main wallet field | No direct field in active account | Routing is handled by app/protocol state |

---

## TrustLink Pay Use

TrustLink Pay uses TINS as the primary payment identity.

Current app surfaces may still support WhatsApp notifications and optional phone linking, but docs and integrations should describe the payment flow as:

```text
sender pays recipient TIN -> TSN settles privately
```

not:

```text
sender pays phone number
```

---

## SDK Entry Points

```ts
import {
  DEFAULT_TINS_PROGRAM_ID,
  buildCreateTinInstruction,
  decodeTinAccount,
  getTinsGlobalStatePda,
  getTinsIdentityPda,
  getTinsRegistryPda,
} from "@trustlink/tsn-sdk/tins";
```

---

## Operational Rules

- TINS program id must remain `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` for the current devnet deployment.
- TSN program id must remain `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` for the current devnet deployment.
- Do not replace TSN program id while updating TINS.
- Do not deploy TINS with a generated local keypair unless its public key matches the configured TINS program id.
- Treat phone/social identity as optional application linking, not as the TINS protocol identity.
