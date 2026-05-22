# TSN Cranker SDK

CLI-focused SDK for TSN cranker (operator) setup commands on Solana.

## Installation

```bash
npm install @trustlink/tsn-cranker-sdk
```

## CLI Usage

```bash
# Initialize mother escrow
npm start -- init-mother

# Register cranker
npm start -- register-cranker

# Set funding policy
npm start -- set-funding-policy true

# Initialize vault
npm start -- init-vault <TOKEN_MINT>

# Fund cranker
npm start -- fund-cranker <TOKEN_MINT> <FUNDER_KEYPAIR> <FUNDER_TOKEN_ACCOUNT> <AMOUNT>

# Withdraw cranker funds
npm start -- withdraw-cranker <TOKEN_MINT> <FUNDER_KEYPAIR> <FUNDER_TOKEN_ACCOUNT> <AMOUNT>

# Settle epoch
npm start -- settle-epoch --force
```

## Environment Variables

- `RPC_URL` - Solana RPC endpoint
- `PROGRAM_ID` - TSN program ID
- `KEYPAIR_PATH` - Path to operator keypair (default: ./cranker-keypair.json)
- `TSN_AUTHORITY_KEYPAIR_PATH` - Path to authority keypair
- `SOLANA_ESCROW_AUTHORITY_SECRET_KEY` - Authority secret key (JSON format)
- `SOLANA_CLAIM_VERIFIER_SECRET_KEY` - Claim verifier secret key

## Programmatic Usage

```typescript
import { TsnClient, motherEscrowPda, crankerPda } from "@trustlink/tsn-cranker-sdk";
import type { Program } from "@coral-xyz/anchor";

// Create client from Anchor program
const client = new TsnClient(program as Program);

// Get PDAs
const [motherEscrow, bump] = client.motherEscrowPda();
```