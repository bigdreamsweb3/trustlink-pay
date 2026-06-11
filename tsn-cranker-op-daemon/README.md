# TSN Cranker Operator Daemon

This folder is the operator workspace for running a TSN Cranker against your deployed TSN program. It operates after TINS identity resolution and optional SAS verification; it does not replace either layer.

It covers:

- operator registration on-chain
- vault initialization/funding/withdrawal
- local operator state tracking (`operator-state.json`)
- running the reference Cranker loop

## Folder Layout

```text
tsn-cranker-op-daemon/
|- keys/                     local keypairs
|- ledger/                   local operator ledger output
|- operator-state.json       auto-updated local state for PDAs and history
|- scripts/guided-setup.mjs  interactive setup wizard
|- scripts/tsn-setup.mjs     raw CLI wrapper + state updater
|- scripts/cranker.ts        reference Cranker runtime loop
|- .env.example              env template
|- package.json              runnable commands
|- README.md
```

## Why `operator-state.json` Matters

After successful setup commands, the daemon stores:

- active program/rpc context
- operator pubkey
- mother escrow PDA
- cranker PDA
- vault PDAs by token mint
- vault token metadata (`tokenSymbol`, `tokenName`)
- liquidity position PDAs by funder
- last command + history

This prevents operators from getting lost when program IDs or RPC targets change.

## Prerequisites

- Node.js installed
- Solana CLI installed
- TSN program deployed (you have `PROGRAM_ID`)
- SOL in operator wallet for transaction fees
- token mint + token account for funding

Common devnet USDC mint:
`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

## Install

```bash
cd C:\Users\codepara\Desktop\trust-link\tsn-cranker-op-daemon
npm install
```

## Configure `.env`

Create `.env` from `.env.example` and set at least:

- `RPC_URL`
- `PROGRAM_ID`
- `KEYPAIR_PATH=./keys/cranker-keypair.json`
- `SOLANA_ALLOWED_SPL_TOKENS=[{"mintAddress":"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU","symbol":"USDC","name":"USD Coin","decimals":6}]` (read by TSN SDK token registry)

Token input behavior:

- `npm run setup` supports token symbol or mint input (`USDC` or full mint)
- `npm run setup:raw -- init-vault <TOKEN_SYMBOL_OR_MINT>` also supports symbol or mint


## Autonomous Python Cranker Runtime

The TSN OTDT and smart-recovery update (`dfa0735`) adds an autonomous Python scheduler at:

```text
scripts/cranker_daemon.py
```

The daemon monitors the TSN mempool file and automatically processes:

- intent verification and claim-point accounting,
- claim lease acquisition and OTDT hash issuance,
- in-memory settlement-token decryption for authorized Cranker DNA,
- settlement proof recording and recoverable registry updates,
- recovery queue creation and priority recovery completion,
- liquidity metric updates.

Run once for validation:

```bash
TSN_SETTLEMENT_TOKEN_MASTER_KEY=<32-byte-base64-or-64-char-hex-secret> \
TSN_CRANKER_ONCE=true \
python scripts/cranker_daemon.py
```

Run continuously from this package:

```bash
TSN_SETTLEMENT_TOKEN_MASTER_KEY=<32-byte-base64-or-64-char-hex-secret> \
npm run crank:python
```

The commitment registry is the public recovery/verification source of truth. It must not store sender wallets, recipient main wallets, phone numbers, token balances, SAS PII, or decrypted settlement tokens. See [`../docs/OTDT-SMART-RECOVERY.md`](../docs/OTDT-SMART-RECOVERY.md) and [`../docs/CRANKER.md`](../docs/CRANKER.md).

## Step-by-Step Setup (What, Why, Result)

For non-crypto operators:

- You can type token symbols like `USDC` (not long mint addresses).
- If you leave `Funder token account` empty, setup auto-finds the correct token account (ATA).
- You enter normal token amounts like `20`, and setup converts it to base units for the chain.

### 1. Create/fund operator keypair

Command examples:

```bash
solana-keygen new --no-bip39-passphrase --force -o keys/cranker-keypair.json
solana airdrop 1 $(solana-keygen pubkey keys/cranker-keypair.json) --url devnet
```

Why:

- Cranker transactions need SOL for network fees.

What happens:

- keypair file created locally
- wallet funded on devnet

Expected result:

- key exists at `KEYPAIR_PATH`
- wallet has enough SOL

### 2. Register your Cranker operator

Command:

```bash
npm run register
```

Why:

- Registration creates/activates your operator PDA identity in TSN.

What happens:

- on-chain Cranker record is created for operator wallet.

Expected result:

- success logs from CLI
- `operator-state.json` updated with `cranker`, `operatorPubkey`, `motherEscrow`

### 3. Set funding policy

Commands:

```bash
npm run policy:open
npm run policy:closed
```

Why:

- Controls whether external funders can provide vault liquidity.

What happens:

- policy flag updated on Cranker state.

Expected result:

- success log + updated local state history

### 4. Initialize vault for token mint

Command:

```bash
npm run setup:raw -- init-vault <TOKEN_SYMBOL_OR_MINT>
```

Why:

- Cranker needs a vault PDA for each mint it services.

What happens:

- vault PDA, authority PDA, token account PDA are initialized/derived and tracked.

Expected result:

- successful transaction
- `operator-state.json` includes this mint under `vaults`

### 5. Fund Cranker vault

Command:

```bash
npm run setup:raw -- fund-cranker <TOKEN_SYMBOL_OR_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
```

Why:

- Vault needs liquidity to execute payouts/settlements.

What happens:

- liquidity position PDA for the funder is created/updated.
- setup auto-derives your token account if you leave it blank
- setup converts human amount (for example `20 USDC`) into base units (`20000000`)

Expected result:

- successful funding tx
- `operator-state.json` adds/updates `liquidityPositions`

Example guided flow:

1. Run `npm run setup`
2. Choose `4` (Fund cranker vault)
3. Token: type `USDC`
4. Funder keypair: press Enter for default
5. Funder token account: press Enter for auto
6. Amount: type `20`
7. Setup prints conversion and submits transaction

### 6. Run Cranker runtime loop

Command:

```bash
npm run crank:start
```

or

```bash
npm run crank:reference
```

Why:

- This is the worker loop that consumes TSN mempool work and executes it through the TSN on-chain program.

What happens:

- polls mempool work
- creates the TSN payment intent on-chain if it is not there yet
- claims the intent with the cranker operator keypair
- submits proof through the TSN program, which moves tokens from the cranker vault to the recipient token account
- marks mempool work executed only after the confirmed on-chain proof transaction returns

Expected result:

- periodic `[tsn-cranker] ...` logs
- no TypeScript loader errors
- every completed work item has a real Solana transaction signature

## New Program Migration Checklist

When you deploy a new TSN contract (`PROGRAM_ID` changes):

1. Update `.env` with new `PROGRAM_ID` and correct `RPC_URL`
2. Confirm the protocol admin has initialized mother escrow for the new program
3. Run `register`
4. Re-run `init-vault` per mint
5. Re-fund vault(s)
6. Start Cranker loop

Do not assume old PDAs are valid on a new program ID.

## Troubleshooting

### Error: `Unknown file extension ".ts"` when running Cranker

Cause:

- Running TypeScript with `node` directly in ESM mode.

Fix:

- Use `tsx` scripts (`npm run crank:start` now uses `tsx`).

### Error: permission or missing funds on Solana tx

Cause:

- operator/funder wallet has insufficient SOL or token balance.

Fix:

- fund wallets and verify token accounts before retrying.

### Error: cannot withdraw funded position

Cause:

- withdraw signer is not the original funder of that liquidity position.

Fix:

- use the same funder keypair used for `fund-cranker`.

## Commands Reference

- `npm run setup` -> interactive setup wizard
- `npm run help` -> raw CLI help
- `npm run register` -> register Cranker
- `npm run policy:open` -> allow external funding
- `npm run policy:closed` -> disallow external funding
- `npm run setup:raw -- init-vault <TOKEN_MINT>` -> init vault
- `npm run setup:raw -- fund-cranker <TOKEN_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>` -> fund vault
- `npm run setup:raw -- withdraw-cranker <TOKEN_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>` -> withdraw
- `npm run settle:force` -> force settle epoch (dev/test)
- `npm run crank:start` -> start Cranker loop
- `npm run crank:reference` -> alias to Cranker loop
