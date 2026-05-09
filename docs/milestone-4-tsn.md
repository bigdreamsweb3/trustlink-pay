# Milestone 4: TSN And Proof Of Payment

TSN means TrustLink Settlement Network. It is the settlement layer being added beside the existing TrustLink Pay escrow flow.

The old flow released escrow directly during the receiver claim transaction. The M4 flow records a claim request first, then lets a Cranker settle it.

## M4 Goal

Make TrustLink Pay work like this:

1. Sender pays a WhatsApp number.
2. Existing escrow PDA locks the funds.
3. Backend creates a TSN `payment_intent`.
4. Receiver requests claim to a wallet.
5. Backend creates a DB-only `claim_request`.
6. Cranker claims the on-chain lease.
7. Cranker pays the receiver from PDA-held Cranker vault liquidity.
8. Cranker submits Proof of Payment.
9. Epoch settlement later reimburses Crankers and splits fees.

## What Is On-Chain

- `MotherEscrow`
- `Cranker`
- `CrankerVault`
- `LiquidityPosition`
- `PaymentIntent`
- `tsn_initialize_mother_escrow`
- `tsn_register_cranker`
- `tsn_initialize_cranker_vault`
- `tsn_set_cranker_funding_policy`
- `tsn_fund_cranker`
- `tsn_withdraw_cranker_funds`
- `tsn_create_intent`
- `tsn_claim_intent`
- `tsn_reassign_intent`
- `tsn_submit_proof`
- `tsn_settle_epoch`

The program code lives in:

- `backend/programs/trustlink-escrow/src/tsn/`

## What Is Off-Chain In M4

- claim request ledger
- Cranker polling
- receiver destination lookup
- encrypted Cranker operator ledger
- permanent storage batching plan

The DB tables are:

- `payment_intents`
- `claim_requests`

## Cranker DNA

Each Cranker PDA is derived from:

- TSN seed
- Mother Escrow PDA
- Cranker operator wallet

The Cranker account stores a DNA hash. Lease claim and proof submission verify this DNA before the Cranker can act.

## Lease Logic

Only one Cranker can hold the lease for an intent:

```text
pending -> claimed -> executed -> settled
              |
              +-- expired -> pending
```

The chain is the lock manager. If two Crankers try to claim the same intent, only one transaction can win.

## Cranker Ledger

`backend/scripts/tsn-cranker.ts` writes an encrypted append-only file:

```text
.cranker-ledger-encrypted.jsonl
```

Each line includes:

- intent id
- timestamp
- Cranker pubkey
- proof transaction
- encrypted payload

The encrypted payload contains receiver wallet, receiver phone hash, amount, and mint. This keeps sensitive routing data off-chain and outside public logs.

## Funding A Cranker

The Cranker operator wallet does not hold pooled token liquidity. It only needs SOL for lease/proof transactions.

Token liquidity is held in a Cranker PDA vault:

- `CrankerVault` tracks the vault and active token mint.
- `LiquidityPosition` tracks each funder's principal and withdrawals.
- External funding can be enabled or disabled by the Cranker operator.
- Only the wallet that funded a position can withdraw that position's available principal.

The operator wallet is loaded from:

```bash
TSN_CRANKER_KEYPAIR_PATH=./cranker-keypair.json
```

Fund or withdraw through the program, not by giving funds to the operator keypair:

```bash
tsx scripts/tsn-setup.ts init-vault <TOKEN_MINT>
tsx scripts/tsn-setup.ts set-funding-policy true
tsx scripts/tsn-setup.ts fund-cranker <TOKEN_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
tsx scripts/tsn-setup.ts withdraw-cranker <TOKEN_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
```

LP reward accounting and reward withdrawal build on top of these positions.

## Commands

```bash
cd backend
tsx scripts/init-db.ts
tsx scripts/tsn-setup.ts init-mother
tsx scripts/tsn-setup.ts register-cranker
tsx scripts/tsn-setup.ts init-vault <TOKEN_MINT>
tsx scripts/tsn-setup.ts fund-cranker <TOKEN_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
tsx scripts/tsn-cranker.ts
```

Epoch settlement commands:

```bash
tsx scripts/tsn-setup.ts settle-epoch
tsx scripts/tsn-setup.ts settle-epoch --force
```

`settle-epoch` enforces the configured epoch interval (default 7 hours).  
`settle-epoch --force` is for operator-controlled testing and skips waiting.

## Tested Security Proofs

- Vault payout path: Cranker proof submission now transfers from Cranker PDA vault to recipient token account.
- Funder-only withdrawal: wallet that funded a `LiquidityPosition` can withdraw available principal.
- Non-funder rejection: different wallet fails withdrawal because its `LiquidityPosition` for that vault is not initialized.

## Devnet Testing Notes (From Real Runs)

- `tsx scripts/tsn-setup.ts init-mother` can fail with `Allocate ... already in use` on devnet. This indicates the `MotherEscrow` PDA already exists (you initialized it earlier). Skip init and continue.
- `withdraw-cranker` is intentionally a **funder-controlled withdrawal** (withdraw your own position principal). If you pass the funder keypair and `1000000`, the program will withdraw `1.000000` USDC by design.
- If you test “unauthorized wallet cannot withdraw”, first make sure the unauthorized wallet has enough SOL to pay transaction fees, otherwise you’ll fail before the program’s authorization checks run.

Use Ubuntu for `anchor deploy` if the Windows Anchor toolchain cannot build SBF.
