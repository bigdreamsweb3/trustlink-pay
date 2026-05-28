# TINS Operator Guide

This guide covers the current TINS devnet operator flow.

## Program ID

```text
TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
```

## Responsibilities

TINS operators maintain the identity program deployment and initialize the global state. TrustLink Pay uses TINS as the wallet-owned identity layer and keeps WhatsApp phone ownership in the backend database.

## Build

```powershell
cd tins-registrar/program
cargo build-sbf
```

From the repository root:

```powershell
npm run tins:build
```

## Deployment

Deployment must be performed with the real TINS program keypair. The keypair public key must equal:

```text
TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
```

Do not use a generated local `target/deploy` keypair unless its public key matches that id.

Command shape:

```powershell
solana program deploy target/deploy/tins_program.so --url devnet --program-id <REAL_TINS_PROGRAM_KEYPAIR_JSON>
```

## Initialization

The TINS global state PDA uses seed:

```text
global-state
```

The current program instruction is `InitializeProgram` with:

```text
starting_sequence: u64
```

The frontend TIN creation flow expects the global state account to exist before users create TINs.

## Active Identity Model

The active account is `TinAccount`:

| Field | Purpose |
| --- | --- |
| `tin` | Numeric Transfer Identity Number |
| `display_name` | Public display name |
| `identity_pubkey` | Wallet-derived TINS PDA |
| `encrypted_phone` | Client-encrypted phone payload |
| `created_at` | Creation timestamp |

Wallet rotation, recovery wallet multisig, protocol fees, and anti-enumeration are not active production features in the current TINS path. Do not document or sell them as live until the program implements and tests them.

## Runtime Checks

After deployment and initialization:

1. Confirm the program id matches `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT`.
2. Confirm the global state PDA exists.
3. Create a TIN from the frontend or SDK.
4. Confirm the backend can verify `/api/identity/tin`.
5. Confirm the dashboard displays the user's TIN.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full stack runbook.

