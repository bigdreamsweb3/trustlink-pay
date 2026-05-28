# TINS Registrar Program

TINS Registrar is the Solana program that creates wallet-owned Transfer Identity Numbers for TrustLink Pay.

## Devnet Program ID

```text
TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
```

The TSN settlement program is separate:

```text
TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
```

## What This Program Stores

The active `CreateTin` path stores:

| Field | Purpose |
| --- | --- |
| `tin` | Numeric Transfer Identity Number |
| `display_name` | Public display name |
| `identity_pubkey` | TINS identity PDA |
| `encrypted_phone` | Client-encrypted phone payload |
| `created_at` | On-chain creation timestamp |

The identity PDA is derived from:

```text
["identity", sha256(wallet_pubkey || "TINS_SALT_2026")]
```

## Build

```powershell
cd tins-registrar/program
cargo build-sbf
```

Or from the repository root:

```powershell
npm run tins:build
```

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

## TrustLink Pay Integration

TrustLink Pay maps WhatsApp phone number to TIN in its backend database. The backend accepts a TIN mapping only after it verifies:

1. The authenticated phone number owns the TrustLink account.
2. The submitted identity PDA matches the wallet and TINS program id.
3. The TINS account exists on Solana devnet and is owned by the TINS program.
4. The decoded on-chain TIN matches the submitted TIN.
5. The wallet signs the phone-to-TIN binding message.

See `docs/TINS.md` and `docs/DEPLOYMENT.md` for the full production runbook.

