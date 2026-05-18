# TSN Cranker Operator Workspace

This folder is the standalone operator side of the Transfer Settlement Network. It is meant to feel like a real third-party Cranker workspace: separate from the TrustLink backend, connected to the TSN npm package, and responsible for operator setup, vault management, and settlement actions.

## Current Scope

Today this workspace covers two things clearly:

- **operator setup and vault management on-chain**
- **a reference Cranker runner flow for local or TSN mempool testing**

That means you can already create an operator, register a Cranker, initialize vaults, fund them, withdraw only your own position, and run the current reference Cranker loop. The long-term fully packaged standalone runner will keep moving into the TSN SDK, but this workspace is already the right external-operator shape.

## Folder Shape

```text
crankerOP-temp/
├─ keys/                 operator keypairs kept local
├─ ledger/               encrypted local operator ledger output
├─ operator-state.json   local record of operator PDAs and funding state
├─ scripts/              local wrappers around the TSN SDK CLI
├─ .env.example          operator environment template
├─ package.json          operator commands
└─ README.md             setup and testing guide
```

## What This Workspace Does

- registers a Cranker operator on-chain
- initializes a Cranker PDA vault per token mint
- funds the vault from a real funder wallet
- withdraws only from that funder's own position
- force-settles epochs in dev/test mode
- runs the current reference Cranker loop against TSN work feeds

This workspace does not hold pooled liquidity in the operator wallet. Liquidity lives in the Cranker PDA vault, and withdrawals are tied to the wallet that funded the liquidity position.

## Local Operator State File

Every successful setup action updates:

```text
operator-state.json
```

This gives the operator a local record of useful values such as:

- operator pubkey
- mother escrow PDA
- cranker PDA
- vault PDAs per token mint
- vault token account
- liquidity position PDAs per funder
- recent setup history

This file is meant to make operator setup understandable without forcing people to manually recompute addresses every time.

## Prerequisites

Before starting your first Cranker, make sure you have:

- Node.js installed
- Solana CLI installed
- access to a funded operator wallet for SOL fees
- a deployed TSN program ID
- a token mint you want the Cranker to service
- a token account that holds the liquidity you want to fund into the Cranker PDA vault

For devnet, the common test USDC mint used in this repo is:

```text
4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

## Quick Start

```bash
cd crankerOP-temp
npm install
cp .env.example .env
mkdir -p keys ledger
solana-keygen new --no-bip39-passphrase --force -o keys/cranker-keypair.json
```

Update `.env` if needed. By default it expects:

- `RPC_URL`
- `PROGRAM_ID`
- `KEYPAIR_PATH=./keys/cranker-keypair.json`

Normal Cranker operators only need:

- `RPC_URL`
- `PROGRAM_ID`
- `KEYPAIR_PATH`

`TSN_AUTHORITY_KEYPAIR_PATH` is **admin-only**. It is not required for normal operator setup, vault funding, withdrawals, or running the Cranker.

Fund the operator keypair with SOL so it can pay transaction fees:

```bash
solana airdrop 1 $(solana-keygen pubkey keys/cranker-keypair.json) --url devnet
```

If the devnet faucet rate-limits you, transfer SOL to the operator wallet from another funded wallet.

## First Cranker Setup

This is the cleanest first-time path.

### 1. Confirm protocol is already deployed

From the main repo, the TSN program should already be built and deployed from:

```bash
tsn/protocol
```

You should have the deployed `PROGRAM_ID` in `.env`.

If you are only running a Cranker, stop there. You do **not** need protocol authority credentials.

### 2. Run guided setup

```bash
npm run setup
```

Recommended first-time order inside the wizard:

1. Register cranker
2. Set funding policy
3. Initialize vault
4. Fund cranker vault

### 3. What you need during funding

When the wizard asks for funding details, you need:

- the token mint
- the funder keypair path
- the funder's token account address
- the funding amount in base units

Example:

- 20 USDC on a 6-decimal mint = `20000000`
- 1 USDC = `1000000`

### 4. Verify setup succeeded

After setup, you should have:

- an operator keypair in `keys/`
- a registered Cranker on-chain
- a Cranker PDA vault for the mint
- a funded liquidity position tied to the funder wallet

## Running Your First Cranker

Today, the current runnable loop in this workspace is the **reference Cranker runner**:

```bash
npm run crank:reference
```

This starts the TSN reference runner from `tsn/scripts/cranker.ts`. It is the current external-operator way to consume TSN work feeds from the repo while the fully packaged standalone runner continues moving into the SDK.

### What the reference runner does

- watches the TSN work source
- evaluates whether settlement is economically claimable
- marks work as executed or reverted in the current reference flow

### What it does not yet replace

The full next-stage standalone SDK runner that performs the entire live on-chain claim/proof flow from this operator folder is still being hardened. For now:

- **operator setup and vault security are live and tested**
- **the reference runner is the clean runnable operator loop**
- **the repo’s tested live payout path has already been proven in the integrated flow**

## Guided Setup

Run the guided setup flow:

```bash
npm run setup
```

The wizard walks you through:

- registering the cranker
- choosing funding policy
- initializing a vault
- funding a vault
- withdrawing from your own funded position
- force-settling an epoch in dev/test
- getting to the point where you can launch the reference runner

If `.env` is missing, the wizard creates it from `.env.example`.

## Operator vs Admin

### Normal Cranker operator

Needs:

- `KEYPAIR_PATH`
- SOL for transaction fees
- a token account to fund liquidity
- the deployed TSN `PROGRAM_ID`

Can do:

- register cranker
- set funding policy
- initialize vault
- fund vault
- withdraw their own funded position
- run the reference Cranker loop

Does **not** need:

- `TSN_AUTHORITY_KEYPAIR_PATH`

### Protocol admin / deployer

Needs:

- `TSN_AUTHORITY_KEYPAIR_PATH`

Uses it for:

- `init-mother`
- protocol-level settlement/admin actions
- future governance or protocol management operations

## Raw Operator Commands

Show available commands:

```bash
npm run help
```

Register the operator as a Cranker:

```bash
npm run register
```

Open or close community funding on the Cranker:

```bash
npm run policy:open
npm run policy:closed
```

Initialize the vault for a mint:

```bash
npm run setup:raw -- init-vault 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

Fund the vault from a real token account:

```bash
npm run setup:raw -- fund-cranker 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU ./keys/cranker-keypair.json YOUR_FUNDER_TOKEN_ACCOUNT 20000000
```

Withdraw from the same funded position:

```bash
npm run setup:raw -- withdraw-cranker 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU ./keys/cranker-keypair.json YOUR_FUNDER_TOKEN_ACCOUNT 1000000
```

Force-settle a test epoch:

```bash
npm run settle:force
```

Do not type placeholders with angle brackets in Bash. Replace values like `YOUR_FUNDER_TOKEN_ACCOUNT` with the real address.

Run the current reference Cranker loop directly:

```bash
npm run crank:reference
```

## Tested Security Behavior

This workspace already matches the tested TSN behavior:

- recipient payout comes from the Cranker PDA vault, not the operator wallet
- the original funder can withdraw its own liquidity position
- a different wallet cannot withdraw that position
- epoch settlement can be forced in dev/test without waiting 7 hours

## Verification Checklist

Your first Cranker setup is healthy if all of these are true:

- operator wallet has SOL for fees
- `.env` points to the correct `PROGRAM_ID`
- Cranker registration succeeds
- vault initialization succeeds for your mint
- funding succeeds and creates a liquidity position
- same funder can withdraw its own amount
- a different wallet cannot withdraw that position
- the reference runner starts without config errors

## Troubleshooting

### `airdrop request failed`

Devnet faucet is rate-limiting you. Fund the operator wallet from another wallet instead.

### `Attempt to debit an account but found no record of a prior credit`

The wallet signing the transaction usually has no SOL for fees.

### `AccountNotInitialized` on withdraw

The wallet trying to withdraw does not own a valid liquidity position for that vault.

### Bash breaks on `<PLACEHOLDER>`

Do not paste angle brackets into commands. Replace placeholders with the real values.

### `ERR_MODULE_NOT_FOUND` for old setup paths

Use the commands in this folder. Do not run old backend-local script paths from this workspace.

## Recommended Test Flow

1. Deploy the TSN program from `tsn/protocol`
2. Initialize mother escrow once
3. Register operator
4. Initialize vault
5. Fund vault
6. Create a payment and claim request from the app
7. Run the Cranker loop from the app/backend side or future SDK runner
8. Verify recipient payout, vault balance change, and ledger output
