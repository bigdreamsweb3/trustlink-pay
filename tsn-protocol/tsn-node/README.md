# TSN Node

Python-based stateless protocol verifier and processor for TSN.

## What it does

- leases received work from the TSN Receiver;
- verifies canonical authorization and routing evidence;
- returns verified or rejected evidence;
- delegates every durable state operation to the Receiver.

## Setup

```bash
pip install -r requirements.txt
python server.py
```

## Environment

Copy `.env.example` to `.env` and configure:
- `PORT` - Server port (default: 8000)
- `GITHUB_TOKEN` - GitHub token used to archive closed epochs
- `TSN_RECEIVER_URL` - Receiver base URL
- `TSN_RECEIVER_NODE_API_KEY` - Node-to-Receiver service credential
- `TSN_PROGRAM_ID` - TSN escrow program id scanned for `CrankerVault` accounts
- `TSN_SOLANA_RPC_URLS` - Shared RPC gateway URL list used for on-chain vault discovery and SPL token balances
- `EPOCH_HOURS` - epoch duration, default `7`

The production Node has no local JSON or direct Firebase store. Firebase belongs
to the TSN Receiver. Direct Firebase and JSON adapters require explicit
isolated-test flags and are not production fallbacks.

Operator daemon state files such as `operator-state.json` are private per operator and must never be read by the TSN Node. Liquidity is discovered by scanning the TSN program for public `CrankerVault` accounts, then querying each vault SPL token account balance on-chain.

## API Endpoints

- `GET /api/mempool` - List pending transactions
- `GET /api/mempool/<tx_id>` - Get transaction details

## Part of TrustLink

This is a submodule of [trustlink-pay](https://github.com/bigdreamsweb3/trustlink-pay).

For the operator view, see the [TSN Mempool UI](https://github.com/bigdreamsweb3/tsn-mempool-frontend).
