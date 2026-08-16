# TrustLink RPC Gateway

TrustLink Pay uses one shared Solana RPC entry point for the app, backend, SDKs, scripts, and Cranker tooling.

The gateway lives in `tsn-rpc-gateway/` as its own project. That keeps the RPC system separate from the app and makes it easier to move into a private repository later.

The current Devnet gateway endpoint is
[`https://tsn-rpc-gateway.vercel.app/`](https://tsn-rpc-gateway.vercel.app/).
Use the local URL below only when running the gateway locally.

The goal is simple:

- one public RPC URL for the product
- multiple upstream Solana RPC providers behind it
- automatic fallback when a provider is slow or unhealthy
- less hardcoded RPC logic scattered through the codebase

## How it works

Set the app-facing RPC URL once:

```bash
TSN_RPC_GATEWAY_URL=http://127.0.0.1:8787
```

That shared URL points to the TrustLink RPC gateway.

The gateway then reads its own upstream list:

```bash
TSN_SOLANA_RPC_URLS=https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY,https://api.devnet.solana.com
```

The gateway ranks upstreams by health and latency, then forwards Solana JSON-RPC requests to the best option first. If one provider fails, it moves to the next provider in the list.

## Local development

Start the gateway:

```bash
npm run rpc:gateway:dev
```

Inspect the configured upstream order:

```bash
npm run rpc:gateway:inspect
```

The same commands exist inside the gateway project:

```bash
cd tsn-rpc-gateway
npm run dev
npm run inspect
```

## Worker compatibility

The gateway is written as a fetch-style handler, so the same core logic can later be deployed to Cloudflare Workers or a similar edge runtime.

## Notes

- The gateway keeps API keys out of the app code.
- The app should point to the gateway URL, not directly to each upstream provider.
- The gateway should be the only place that knows the upstream provider list.
