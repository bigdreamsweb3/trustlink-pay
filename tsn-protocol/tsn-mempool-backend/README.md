# TSN Mempool Backend

Python-based mempool server for TrustLink TSN (Transfer Settlement Network).

## What it does

- Maintains the pending transaction mempool
- Tracks unconfirmed payment intents
- Stores live mempool state in Firebase Firestore
- Provides API for the frontend explorer

## Setup

```bash
pip install -r requirements.txt
python server.py
```

## Environment

Copy `.env.example` to `.env` and configure:
- `PORT` - Server port (default: 8000)
- `GITHUB_TOKEN` - GitHub token used to archive closed epochs
- `MEMPOOL_STORE` - must be `firebase`
- `FIREBASE_CREDENTIALS` - optional path to a Firebase service-account JSON file
- `FIREBASE_PROJECT_ID` - Firebase project id
- `FIREBASE_CLIENT_EMAIL` - Firebase Admin service account email
- `FIREBASE_PRIVATE_KEY` - Firebase Admin private key, with newlines encoded as `\n`
- `FIREBASE_COLLECTION` - Firestore root collection, default `tsn_mempool`
- `TSN_PROGRAM_ID` - TSN escrow program id scanned for `CrankerVault` accounts
- `TSN_SOLANA_RPC_URLS` - Shared RPC gateway URL list used for on-chain vault discovery and SPL token balances
- `EPOCH_HOURS` - epoch duration, default `7`

Redis and local JSON file storage are not used. Firebase Firestore is the mempool source of truth for live intents, claim requests, proofs, and epoch state.

If `FIREBASE_CREDENTIALS` is not set, the server will also look for the first JSON service-account file in `.fb_creds/`.

Operator daemon state files such as `operator-state.json` are private per operator and must never be read by the mempool backend. Liquidity is discovered by scanning the TSN program for public `CrankerVault` accounts, then querying each vault SPL token account balance on-chain.

## API Endpoints

- `GET /api/mempool` - List pending transactions
- `GET /api/mempool/<tx_id>` - Get transaction details

## Part of TrustLink

This is a submodule of [trustlink-pay](https://github.com/bigdreamsweb3/trustlink-pay).

For the frontend explorer, see [tsn-mempool-frontend](https://github.com/bigdreamsweb3/tsn-mempool-frontend).
