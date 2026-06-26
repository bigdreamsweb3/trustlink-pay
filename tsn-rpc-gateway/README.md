# TSN RPC Gateway

This folder contains the shared Solana RPC gateway used by TrustLink Pay.

It is structured as its own project because it can later move into a separate private repository.

## What it does

- accepts one app-facing RPC URL
- forwards requests to upstream Solana RPC providers
- ranks providers by health and latency
- keeps API keys out of the app code
- exposes a fetch handler for Node and future Workers deployment

TrustLink Pay apps, scripts, SDKs, and services point to the gateway server by URL through `TSN_RPC_GATEWAY_URL` (or `NEXT_PUBLIC_TSN_RPC_GATEWAY_URL` in browser bundles). They do not import this project as a client library and do not configure upstream Solana RPC URLs directly.

## Local commands

- `npm run rpc:gateway:dev`
- `npm run rpc:gateway:inspect`

Inside this folder:

- `npm run dev`
- `npm run inspect`
- `npm run check`

See [`docs/RPC-GATEWAY.md`](../docs/RPC-GATEWAY.md) for the full setup guide.
