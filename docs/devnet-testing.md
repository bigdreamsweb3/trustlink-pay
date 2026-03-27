# Devnet Testing Guide

This guide explains how to get the assets needed to test TrustLink Pay on Solana Devnet and where TrustLink's supported test tokens are configured.

## What To Fund For Testing

To test the current on-chain TrustLink escrow flow, you need:

- Devnet SOL for wallet transaction fees
- an allowlisted SPL test token such as devnet USDC

Native `SOL` is useful for gas, but the real escrow flow is now built around SPL token mints that TrustLink explicitly allowlists.

## Where TrustLink Supported Tokens Are Defined

TrustLink does not decide supported tokens by symbol.

Supported test tokens are configured by mint address in the backend environment variable:

- `SOLANA_ALLOWED_SPL_TOKENS`
- treasury and claim fee policy live in `backend/app/config/escrow.ts`

The backend reads that value here:

- `backend/app/lib/env.ts`
- `backend/app/blockchain/solana.ts`

Example:

```env
SOLANA_ALLOWED_SPL_TOKENS=[{"mintAddress":"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU","symbol":"USDC","name":"USD Coin","logo":"$","decimals":6}]
```

That means:

- only the listed mint addresses are treated as supported
- token symbols are display metadata only
- changing the allowlist requires updating the env var and restarting the backend

## Treasury And Fee Recovery Configuration

TrustLink's fee recovery configuration is centralized in:

- `backend/app/config/escrow.ts`

The values it reads are:

- `SOLANA_CLAIM_VERIFIER_SECRET_KEY`
- `TRUSTLINK_TREASURY_OWNER`
- `TRUSTLINK_CLAIM_FEE_BPS`
- `TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT`

Example:

```env
SOLANA_CLAIM_VERIFIER_SECRET_KEY=[1,2,3]
TRUSTLINK_TREASURY_OWNER=YourTreasuryWalletPubkey
TRUSTLINK_CLAIM_FEE_BPS=75
TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT=100
```

That example means:

- TrustLink uses a 0.75% fee
- the fee is capped at `100` token units for supported stablecoins
- claim transactions are signed and fee-paid by the backend verifier wallet
- token fee recovery goes to the configured treasury owner

## How To Get Devnet SOL

In WSL:

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 2
solana balance
```

If the public Devnet faucet rate-limits you, retry later or use your preferred Devnet RPC and faucet workflow.

## How To Get Devnet USDC

The easiest path is to use a Devnet faucet that supports Solana test stablecoins, then send the tokens to the same wallet you use inside TrustLink.

Suggested flow:

1. copy your wallet address from Phantom, Solflare, Backpack, or your chosen Solana wallet
2. use a Devnet USDC faucet
3. confirm the USDC token shows in the wallet
4. make sure the mint address is included in `SOLANA_ALLOWED_SPL_TOKENS`

Current devnet USDC mint used by TrustLink docs:

- `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

## Future Sponsored Send Support

The escrow program is now shaped to support a separate payer account on create_payment.

That means a future TrustLink relayer can pay the SOL account-creation and transaction costs for senders while the sender still signs as the token owner.

Current behavior remains:

- sender still pays send-time SOL fees today
- TrustLink verifier pays claim-time SOL fees today

So this is future-ready contract support, not a live frontend feature yet.

## Test Flow

Once your wallet has Devnet SOL and an allowlisted SPL token:

1. start the backend

```bash
cd backend
npm install
npm run db:init
npm run dev
```

2. start the frontend

```bash
cd frontend
npm install
npm run dev
```

3. connect a wallet in the app
4. verify the receiver in TrustLink
5. choose an allowlisted token
6. create the escrow payment
7. claim it from the receiver side

## One-Time Escrow Config Setup

Claim flow depends on the on-chain escrow config being initialized with the backend verifier wallet.

Run this once from the backend directory after setting the correct verifier secret key in `.env.local`:

```bash
cd backend
npm run escrow:init-config
```

This should not happen lazily during live claim requests.

Recommended production pattern:

- initialize config once
- verify the expected verifier pubkey
- keep the verifier wallet low-balance and backend-only

