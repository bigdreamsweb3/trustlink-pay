# TrustLink Wallet Roles

This guide tracks the Solana wallets TrustLink uses during development and Devnet testing, what each wallet is responsible for, where its keypair file lives, and how it was or should be created.

Keep this file updated whenever you create, rotate, or retire a wallet.

## Why TrustLink Uses Multiple Wallets

TrustLink should not use one wallet for everything.

Separate wallets make it easier to:

- reduce blast radius if one secret leaks
- keep hot wallets low-balance
- protect upgrade authority more carefully
- change treasury or verifier settings later without mixing responsibilities

Recommended split:

- deployer wallet
- verifier wallet
- treasury owner wallet

## Wallet Inventory

### 1. Main Deployer Wallet

Purpose:

- pays for `anchor deploy` or `solana program deploy`
- acts as the upgrade authority unless you later rotate it
- is the wallet you normally inspect with `solana balance`

Current expected file:

- WSL: `~/.config/solana/id.json`
- Windows path from this machine: `C:\Users\codepara\AppData\Local\Packages\CanonicalGroupLimited...` is not the practical source of truth
- practical source of truth for this setup: `/home/bigdream/.config/solana/id.json`

How it was created:

```bash
solana-keygen new --no-bip39-passphrase -o ~/.config/solana/id.json
solana config set --keypair ~/.config/solana/id.json
```

How to inspect it:

```bash
solana address
solana balance
```

Usage notes:

- do not use this wallet as the day-to-day backend verifier
- keep this wallet separate from treasury operations
- for stronger long-term security, this wallet should eventually be colder than the verifier wallet

## 2. TrustLink Verifier Wallet

Purpose:

- signs escrow claim approval as the on-chain `claim_verifier`
- pays claim transaction fees when TrustLink relays a claim
- initializes escrow config

Current expected file:

- WSL: `~/.config/solana/trustlink-verifier.json`
- practical source of truth on this machine: `/home/bigdream/.config/solana/trustlink-verifier.json`

How it was created:

```bash
solana-keygen new --no-bip39-passphrase -o ~/.config/solana/trustlink-verifier.json
solana-keygen pubkey ~/.config/solana/trustlink-verifier.json
```

How it is used in env:

- `SOLANA_CLAIM_VERIFIER_SECRET_KEY`
- backward-compatible fallback still supported: `SOLANA_ESCROW_AUTHORITY_SECRET_KEY`

How to inspect it:

```bash
solana-keygen pubkey ~/.config/solana/trustlink-verifier.json
solana balance $(solana-keygen pubkey ~/.config/solana/trustlink-verifier.json)
```

Usage notes:

- this is a hot backend wallet
- keep only a small SOL balance in it
- do not reuse it for deploys
- do not expose this key outside backend secrets

## 3. TrustLink Treasury Owner Wallet

Purpose:

- owns the treasury token accounts that receive TrustLink's token fee share
- is the wallet address referenced by `TRUSTLINK_TREASURY_OWNER`
- should receive fee proceeds from claim-time fee splitting after the upgraded program is deployed

Recommended file:

- WSL: `~/.config/solana/trustlink-treasury.json`
- practical source of truth on this machine after creation: `/home/bigdream/.config/solana/trustlink-treasury.json`

Create it with:

```bash
solana-keygen new --no-bip39-passphrase -o ~/.config/solana/trustlink-treasury.json
solana-keygen pubkey ~/.config/solana/trustlink-treasury.json
```

After creation:

1. copy the public key
2. set `TRUSTLINK_TREASURY_OWNER` in backend env
3. keep the secret file private
4. document the created public key in this file

Suggested record section to fill in after creation:

- treasury pubkey: `REPLACE_ME`
- created on: `REPLACE_ME`
- operator note: `REPLACE_ME`

Usage notes:

- treasury owner should be separate from verifier
- this wallet does not need to be the fee payer for claims
- if you later move to production, consider a multisig treasury owner

## Environment Mapping

These values depend on the wallets above:

- `SOLANA_CLAIM_VERIFIER_SECRET_KEY`
  - secret key JSON from `trustlink-verifier.json`
- `TRUSTLINK_TREASURY_OWNER`
  - public key from `trustlink-treasury.json`

Related fee settings:

- `TRUSTLINK_CLAIM_FEE_BPS`
- `TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT`

## Current Devnet Program Context

Current deployed Devnet program:

- program id: `HoqZ2tRMGRTrHDGbPLFZB55bnFpsPMbY4jrJrBv7LWB1`

Current initialized escrow config from the verifier flow:

- config PDA: `GQ5btAvw43ywwovZ3P4MxBiDedyFWwUL8xZ5uy9Bk5Vi`
- current verifier pubkey used at config init: `6DTGZzxzazGHYZq4HHp2q1PUQtEeeWRvT6FcsNJEoMWL`

Important note:

- the new treasury fee-splitting contract changes still need a fresh deploy before treasury fee routing becomes live on-chain

## Wallet Creation Checklist

When creating a new TrustLink wallet:

1. create it with `solana-keygen new`
2. store it under `~/.config/solana/` with a role-specific file name
3. record the file path in this document
4. record the public key in this document
5. record which env variable or operational role uses it
6. never commit the secret JSON file

## Security Notes

- never commit private key JSON files
- never paste private key JSON into screenshots or public docs
- keep deployer, verifier, and treasury separate
- keep verifier low-balance because it is a hotter wallet
- consider a colder or multisig setup for deployer and treasury as the project matures
