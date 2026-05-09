# Devnet And TSN Testing

Use this runbook to test the full TrustLink Pay M4 flow.

## Prerequisites

- Ubuntu or another environment where `anchor deploy` works
- Solana CLI configured for localnet or devnet
- backend `.env.local` configured
- frontend `.env.local` pointing to the backend
- a sender wallet with SOL and test token balance
- a Cranker operator keypair with SOL for lease/proof transactions
- a funder wallet and token account with the SPL token used to fund the Cranker PDA vault

Enable TSN:

```bash
TSN_ENABLED=true
TSN_CREATE_INTENTS_ONCHAIN=true
TSN_CRANKER_KEYPAIR_PATH=./cranker-keypair.json
```

## Local Validator Flow

```bash
solana-test-validator
cd backend
anchor deploy
tsx scripts/init-db.ts
tsx scripts/tsn-setup.ts init-mother
tsx scripts/tsn-setup.ts register-cranker
tsx scripts/tsn-setup.ts init-vault <TOKEN_MINT>
tsx scripts/tsn-setup.ts fund-cranker <TOKEN_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
npm run dev
```

Then run the frontend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3001`.

## Test Payment Flow

1. Register or log in as the sender.
2. Connect a sender wallet.
3. Send a payment to a WhatsApp number.
4. Confirm that the payment locks in escrow.
5. Confirm a row exists in `payment_intents`.
6. Open the claim page as the receiver.
7. Connect the receiver wallet and enter PIN.
8. Confirm that the UI shows the claim as queued for Cranker settlement.
9. Confirm a row exists in `claim_requests`.

## Run The Cranker

```bash
cd backend
tsx scripts/tsn-cranker.ts
```

The Cranker should:

- find the pending intent and claim request
- call `tsn_claim_intent`
- mark the intent as claimed in DB
- submit a proof with `tsn_submit_proof`
- mark the claim request completed
- append an encrypted line to `.cranker-ledger-encrypted.jsonl`

## Proven Test Results (May 9, 2026)

The following path was validated end-to-end on devnet:

1. Program deployed and Cranker registered.
2. Cranker vault initialized for USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
3. Vault funded through `tsn_fund_cranker`.
4. New payment created in frontend, intent created on-chain, claim request posted.
5. Cranker claimed lease and submitted proof successfully.
6. Recipient USDC balance increased.
7. Vault balance decreased accordingly.
8. Funder wallet successfully withdrew its own principal.
9. Non-funder wallet withdraw failed (`liquidity_position` not initialized for that wallet).

Important observed behavior:

- Old DB claim requests can exist for intents that were never created on-chain; those fail with `AccountNotInitialized`.
- Duplicate claim requests for the same payment can happen in current DB flow; this should be deduped in the API layer.
- Running `tsx scripts/tsn-setup.ts init-mother` can fail with `Allocate ... already in use` on devnet. This means the `MotherEscrow` PDA already exists (expected if you initialized it previously). Do not re-run init.
- `withdraw-cranker` is a **funder action** (withdraw your own `LiquidityPosition` principal). It is not an automated “cranker runner withdrawal”. If you pass your funder keypair and an amount, it will withdraw that amount by design.
- Unauthorized-withdraw testing requires the unauthorized wallet to have SOL for tx fees, otherwise you will fail early with `Attempt to debit an account but found no record of a prior credit` and never hit the program’s authorization checks.

## Fund Or Withdraw Cranker Liquidity

Cranker liquidity is not held by the operator keypair. It is held by the program-owned Cranker vault PDA.

Initialize the vault once per token mint:

```bash
cd backend
tsx scripts/tsn-setup.ts init-vault <TOKEN_MINT>
```

Fund it from the wallet that owns the source token account:

```bash
tsx scripts/tsn-setup.ts fund-cranker <TOKEN_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
```

Withdraw available principal back to the same funder wallet's token account:

```bash
tsx scripts/tsn-setup.ts withdraw-cranker <TOKEN_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
```

If the Cranker operator wants to stop community funding and only self-fund:

```bash
tsx scripts/tsn-setup.ts set-funding-policy false
```

## Epoch Settlement Testing (No 7-Hour Wait Required)

`MotherEscrow` still defaults to 7 hours (`epoch_seconds = 25200`).  
For testing, use forced settlement:

```bash
tsx scripts/tsn-setup.ts settle-epoch --force
```

For production-like behavior (time-gated), run without force:

```bash
tsx scripts/tsn-setup.ts settle-epoch
```

## Useful Checks

Pending work feed:

```bash
curl http://localhost:3000/api/tsn/work/pending
curl http://localhost:3000/api/intents/pending
```

Cranker ledger:

```bash
cat backend/.cranker-ledger-encrypted.jsonl
```

Database checks:

```sql
select id, payment_id, status from payment_intents order by created_at desc;
select id, payment_id, intent_id, status from claim_requests order by requested_at desc;
```

## Proof Checklist (Attach To Test Reports)

- Program deploy succeeded (`anchor deploy` shows Program Id + signature).
- `MotherEscrow` exists (either init succeeds, or init fails with “already in use” because it was already initialized).
- Cranker registered successfully (`register-cranker`).
- Vault initialized + funded (`init-vault`, `fund-cranker`).
- Receiver claim created (DB `claim_requests` row) without receiver paying a separate claim fee in TSN mode.
- Cranker executed: recipient token balance increased (`spl-token accounts --owner <recipient>`).
- Vault decreased (token account confirmed as `Owner: Tokenkeg...`, and balance dropped using `spl-token account-info` or the `solana account` fallback).
- Funder withdrew own principal (success signature + funder token balance increased).
- Non-funder withdrawal rejected (fails because `liquidity_position` is not initialized for that wallet).

## Balance / Account Checks (What We Actually Used On Devnet)

Check a wallet’s SPL token balances:

```bash
spl-token accounts --owner <WALLET_PUBKEY> --url devnet
```

When verifying vault token-account state, `spl-token account-info <TOKEN_ACCOUNT>` should work in a normal environment. In our environment it sometimes mis-parsed a token-account PDA and returned:

```text
Could not find mint account <...>
```

Workaround that consistently proves “this is a token account” (and helps debug):

```bash
solana account <TOKEN_ACCOUNT_PUBKEY> --url devnet
```

Expected signs it’s an SPL token account:

- `Owner: Tokenkeg...`
- `Length: 165`

## What M4 Does Not Finish Yet

- real SPL token payout from Cranker PDA vault liquidity
- LP reward withdrawal accounting
- LP share accounting
- slashing
- full epoch reimbursement
- permanent archive upload to Arweave/Irys

Those are next after the local Cranker path proves the lease and proof lifecycle.
