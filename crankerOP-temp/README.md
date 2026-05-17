# TSN Cranker Test Workspace

This folder simulates an external Cranker operator setup using TSN as an npm package dependency.

## Setup

```bash
cd cranker-test
npm install
cp .env.example .env
```

Create `.env` from `.env.example` and set values:

- `RPC_URL`
- `PROGRAM_ID`
- `KEYPAIR_PATH`

## Run

```bash
npm run start
```

Expected output in current scaffold stage:

- prints `rpc` and `programId`
- confirms SDK process starts successfully

This workspace is intentionally separated from backend so TSN operator setup is tested as an independent consumer flow.

## Operator Setup Commands

Create the operator keypair:

```bash
solana-keygen new --no-bip39-passphrase --force -o cranker-keypair.json
```

Fund the operator wallet with SOL for transaction fees:

```bash
solana airdrop 1 $(solana-keygen pubkey cranker-keypair.json) --url devnet
```

Register the Cranker PDA:

```bash
npm run setup -- register-cranker
```

Initialize the Cranker vault for a token mint:

```bash
npm run setup -- init-vault 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

Fund the Cranker vault:

```bash
npm run setup -- fund-cranker 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU cranker-keypair.json YOUR_FUNDER_TOKEN_ACCOUNT 20000000
```

Do not type angle brackets like `<FUNDER_TOKEN_ACCOUNT>` in Bash. Replace placeholders with real values.
