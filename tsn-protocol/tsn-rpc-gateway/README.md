# TSN RPC Gateway by TrustLink Labs

This service is the shared Solana RPC gateway used by the Transfer Settlement
Network (TSN), operated by TrustLink Labs.

It is a standalone private service repository. The gateway keeps upstream
provider credentials server-side and exposes one controlled transport endpoint
to TSN applications and operators.

## What it does

- accepts one app-facing RPC URL
- forwards requests to upstream Solana RPC providers
- ranks providers by health and latency
- keeps API keys out of the app code
- exposes a fetch handler for Node and future Workers deployment

TrustLink Pay apps, scripts, SDKs, and services point to the gateway server by URL through `TSN_RPC_GATEWAY_URL` (or `NEXT_PUBLIC_TSN_RPC_GATEWAY_URL` in browser bundles). They do not import this project as a client library and do not configure upstream Solana RPC URLs directly.

The gateway itself reads a comma-separated list from `TSN_SOLANA_RPC_URLS` and automatically fails over when a provider is slow or unhealthy.
Provider health and latency are learned from real requests and cached in
memory. `TSN_RPC_GATEWAY_PROBE_MODE` defaults to `on-demand`, so the gateway
does not continuously poll upstreams while idle. Set it to `scheduled` only
when continuous health probes are explicitly required.

## Ports

- One listener handles HTTP JSON-RPC requests and Solana WebSocket connections.
- HTTP JSON-RPC is available at `/` or `/rpc`.
- WebSocket subscriptions are available at `/ws` on the same host and port.
- Local fallback port: `8787`. Cloud platforms can provide `PORT` directly.

Use `TSN_RPC_GATEWAY_URL=http://127.0.0.1:8787` for HTTP callers.
Use `SOLANA_WS_URL=ws://127.0.0.1:8787/ws` for WebSocket subscribers such as the cranker daemon.

## Browser access

Set `TSN_RPC_GATEWAY_ALLOWED_ORIGINS` to a comma-separated allowlist of the
TrustLink browser origins permitted to call the gateway. Do not deploy with
`TSN_RPC_GATEWAY_ALLOW_ANY_ORIGIN=true`; that flag exists only for local
development. Server-to-server callers do not need a browser `Origin` header.

## Wasmer deployment

The current Devnet deployment is hosted by Wasmer:

[https://tsn-rpc-gateway.vercel.app/](https://tsn-rpc-gateway.vercel.app/)

Set the upstream provider URLs and production browser-origin allowlist only in
Wasmer environment variables, never in Git. The deployed URL is the value for
`TSN_RPC_GATEWAY_URL` and `NEXT_PUBLIC_TSN_RPC_GATEWAY_URL` where browser
access is required. The matching WebSocket URL uses the same host with a
`/ws` path.

## Local commands

- `npm run rpc:gateway:dev`
- `npm run rpc:gateway:inspect`

Inside this folder:

- `npm run dev`
- `npm run inspect`
- `npm run check`

See [`docs/RPC-GATEWAY.md`](../docs/RPC-GATEWAY.md) for the full setup guide.
