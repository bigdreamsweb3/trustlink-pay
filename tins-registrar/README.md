# TINS Registrar Program

TINS Registrar is the Solana program that creates wallet-owned Transfer Identity Numbers for TrustLink Pay and future integrations.

A TIN is a 10-digit payment identity that can be shared instead of a wallet address.

---

## Devnet Program ID

```text
TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
```

The TSN settlement program is separate:

```text
TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
```

---

## What The Program Stores

The active `CreateTin` path stores:

| Field | Purpose |
| --- | --- |
| `tin` | Numeric Transfer Identity Number |
| `display_name` | Public display name |
| `identity_pubkey` | TINS identity PDA |
| `encrypted_phone` | Optional encrypted application payload |
| `created_at` | On-chain creation timestamp |

The identity PDA is derived from:

```text
["identity", sha256(wallet_pubkey || "TINS_SALT_2026")]
```

---

## Protocol Role

TINS is the receive identity layer.

```text
10-digit TIN -> identity PDA -> settlement route
```

TrustLink Pay uses TINS as the main payment identity. Phone, WhatsApp, X, business, and other identity links can be added at the application layer later.

---

## Build

```powershell
cd tins-registrar/program
cargo build-sbf
```

Or from the repository root:

```powershell
npm run tins:build
```

---

## Deployment

Deployment is an operator action. Use the real TINS deploy keypair whose public key is:

```text
TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
```

Do not deploy with a generated local `target/deploy` keypair unless its public key matches that program id.

Command shape:

```powershell
solana program deploy target/deploy/tins_program.so --url devnet --program-id <REAL_TINS_PROGRAM_KEYPAIR_JSON>
```

---

## Integration

TrustLink Pay and external apps should treat TINs as the primary receive identity.

Application-layer services may attach phone or social identity metadata, but those links should resolve to TINs instead of replacing TINs.

See `docs/TINS.md` and `docs/INTEGRATION.md`.
