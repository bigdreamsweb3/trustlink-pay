# TrustLink Pay Architecture

TrustLink Pay has three active layers:

1. TrustLink Pay app and backend
2. TINS identity registry
3. TSN settlement network

## TrustLink Pay App

The app owns the user experience:

- WhatsApp authentication
- wallet connection
- TIN creation or loading
- payment creation
- transaction history and status display

The backend owns private application mapping:

```text
WhatsApp phone number -> user account -> TIN -> settlement wallet
```

The backend does not custody funds. It verifies identity, records payment state, and publishes settlement work to TSN.

## TINS Identity Layer

TINS is the on-chain Transfer Identity Number registry.

Current devnet program id:

```text
TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
```

The active TINS account is `TinAccount`:

| Field | Purpose |
| --- | --- |
| `tin` | Numeric Transfer Identity Number |
| `display_name` | Public display name |
| `identity_pubkey` | TINS identity PDA |
| `encrypted_phone` | Client-encrypted phone payload |
| `created_at` | Creation timestamp |

The TINS identity PDA is derived from the wallet and the TINS program id. This means TINS proves wallet ownership of a TIN. TrustLink Pay still keeps the private WhatsApp phone number -> TIN mapping in the backend.

## TSN Settlement Layer

Current devnet program id:

```text
TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
```

TSN handles settlement state:

- payment intents
- cranker registration and leases
- vault funding
- sender and claim fees
- epoch settlement

The TSN Mother Escrow stores the configured TINS program id so cranker and settlement flows use the same identity registry.

## Payment Flow

```text
Sender enters phone number
Backend resolves phone -> recipient TIN
Backend verifies recipient TINS mapping
Frontend signs payment
Backend records payment and TSN intent
Mempool exposes intent to crankers
Cranker submits eligible work on-chain
TSN updates payment settlement state
Frontend polls backend and shows processing steps
```

## Identity Flow

```text
User logs in with WhatsApp
User connects settlement wallet
Frontend creates or loads TIN through TINS
Wallet signs TrustLink phone-to-TIN binding message
Backend verifies the TINS account on Solana RPC
Backend stores phone -> TIN -> wallet mapping
Dashboard displays TIN in the identity and balance surfaces
```

## Data Boundaries

| Data | Owner |
| --- | --- |
| WhatsApp phone number | TrustLink backend |
| Phone -> TIN mapping | TrustLink backend |
| TIN account | TINS program |
| Payment intent and settlement state | TSN / TrustLink backend |
| Funds | User wallets, escrow, or TSN vaults |

## Operator Docs

- [TINS.md](./TINS.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [CRANKER.md](./CRANKER.md)
- [LIQUIDITY.md](./LIQUIDITY.md)

