# TrustLink Pay Deployment Runbook

This runbook is the production source of truth for the local devnet flow. It documents the commands to build, configure, initialize, and test TrustLink Pay with TINS and TSN.

## Program IDs

| Program | Devnet program id |
| --- | --- |
| TINS | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |
| TSN | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |

The repository may contain local generated keypairs under `target/deploy/`. Those files are build artifacts, not the source of truth for production or devnet identity. A program deploy keypair must have a public key equal to the program id above before it is used to deploy that program.

## Required Tools

- Node.js 18+
- npm
- Solana CLI configured for devnet
- Rust and Solana SBF build tools
- Anchor for the TSN program workspace
- Python for the mempool backend

## Environment

Backend `.env.local`:

```env
SOLANA_RPC_URL=https://api.devnet.solana.com
TINS_PROGRAM_ID=TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
```

Frontend `.env.local`:

```env
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_TINS_PROGRAM_ID=TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
```

Cranker `.env.local`:

```env
RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
TINS_PROGRAM_ID=TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
KEYPAIR_PATH=./keys/cranker-keypair.json
```

## Install And Build

```powershell
npm --prefix tsn-sdk install
npm --prefix tsn-sdk run build
npm --prefix tsn-cranker-sdk install
npm --prefix tsn-cranker-sdk run build
npm --prefix backend install
npm --prefix frontend install
npm --prefix tsn-cranker-op-daemon install
```

Initialize or migrate the local backend database:

```powershell
npm --prefix backend run db:init
```

## Build Programs

TINS:

```powershell
npm run tins:program:id
npm run tins:build
```

TSN:

```powershell
npm run tsn:program:id
npm run tsn:program:build
```

## Manual Program Deployment

Deployments are operator actions. Use the real deploy keypair for each program. Do not use a generated `target/deploy` keypair unless its public key is exactly the expected program id.

TINS deploy shape:

```powershell
cd tins-registrar/program
solana program deploy target/deploy/tins_program.so --url devnet --program-id <REAL_TINS_PROGRAM_KEYPAIR_JSON>
```

TSN deploy shape:

```powershell
cd tsn/protocol
anchor deploy --provider.cluster devnet
```

## Initialize TSN With TINS

After TSN is deployed, initialize the Mother Escrow with the configured TINS program id.

```powershell
cd tsn-cranker-sdk
$env:RPC_URL="https://api.devnet.solana.com"
$env:PROGRAM_ID="TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
$env:TINS_PROGRAM_ID="TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT"
$env:KEYPAIR_PATH="..\tsn-cranker-op-daemon\keys\cranker-keypair.json"
npm run cranker -- init-mother
npm run cranker -- register-cranker
```

Initialize a vault for each supported mint:

```powershell
npm run cranker -- init-vault <TOKEN_MINT>
```

## Run Local Stack

Without cranker:

```powershell
npm run dev:tsn:stack
```

With cranker:

```powershell
npm run dev:tsn:stack:with-cranker
```

## Test Flow

1. Log in to TrustLink Pay.
2. Connect the wallet that should own settlement.
3. Create or load the TIN from the dashboard identity section or settings.
4. Confirm `/api/identity` returns `tin`, `tinsIdentityPublicKey`, `tinsRegistryPublicKey`, `tinsWalletPublicKey`, and `tinsProgramId`.
5. Send a payment to a recipient TIN.
6. Confirm the backend records the payment and TSN intent metadata.
7. Confirm the mempool shows intent state before cranker settlement.
8. Start the cranker and verify the payment advances from pending to escrowed to executed/settled state.

## Verification Commands

```powershell
npm --prefix frontend run typecheck
npm --prefix backend run typecheck
npm --prefix tsn-sdk run build
npm --prefix tsn-cranker-sdk run build
```
