# TINS — Transfer Identity Number System

TINS is the identity layer of TrustLink Pay. It gives a user a permanent 10-digit Transfer Identity Number (TIN) that can be shared instead of a wallet address.

```text
TIN -> identity PDA -> settlement route
```

A PDA (Program Derived Address) is an on-chain account controlled by the program, not by a private key. The TIN is the protocol-facing receive identity. Phone numbers and social accounts can be linked as optional discovery and trust signals.

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

The registry address enables TIN-based lookup and wallet or app integrations.

---

## What TINS Enables

TINS can be used by:

- TrustLink Pay for TIN-first stablecoin payments
- wallets that want receive identities instead of raw addresses
- merchants that want safer customer-facing payment identifiers
- apps that want private settlement routes through TSN

The core rule:

```text
Users share TINs. Protocols resolve settlement routes.
```

---

## Privacy Position

TINS reduces address exposure by moving the user-facing receive identity away from raw wallet addresses. TSN completes the privacy design by separating sender-side escrow from recipient-side payout.

Public data:

| Data | Public? | Notes |
| --- | --- | --- |
| TIN | Yes | Public receive identity |
| Display name | Yes | Helps sender confirm recipient |
| TINS identity PDA | Yes | Program-owned identity account |
| Encrypted payload | Yes | Public ciphertext, not plaintext |

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

- The TINS program ID must remain `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` for the current devnet deployment.
- The TSN program ID must remain `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` for the current devnet deployment.
- Do not deploy TINS with a generated local keypair unless its public key matches the configured TINS program ID.
- Treat phone and social identity as optional application linking, not as the TINS protocol identity.
