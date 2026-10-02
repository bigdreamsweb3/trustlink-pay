# TSN RPC Gateway

TSN applications and operators use one configured Solana RPC endpoint for SDK
reads, transaction work, and Cranker operations. The default is the hosted TSN
RPC gateway. A developer may choose another preferred RPC, including a locally
running TSN gateway.

## Endpoint selection

Set `TSN_RPC_URL` for SDK and Cranker consumers. `TSN_RPC_GATEWAY_URL` is
accepted as a compatibility alias. If neither is set, the SDK uses the hosted
TSN gateway:

```env
TSN_RPC_URL=https://tsn-rpc-gateway.vercel.app
```

For a local gateway, use `http://127.0.0.1:8787`. The SDK and Cranker validate
and use the one selected RPC endpoint. They do not silently switch to
Solana's public endpoint or another RPC if it fails. Network status describes
the endpoint as `configured`; Node and Receiver can be independently labelled
`local` or `live`.

## Gateway upstreams

The gateway process itself reads its provider list from
`TSN_SOLANA_RPC_URLS`, for example:

```env
TSN_SOLANA_RPC_URLS=https://devnet.helius-rpc.com/?api-key=<provider-key>,https://api.devnet.solana.com
```

Provider credentials belong only in the gateway's server environment. SDKs and
Crankers send requests to the gateway endpoint and do not need provider keys.
The gateway's provider selection is separate from the client's selected RPC
endpoint.

## Local development

Start the gateway from the repository root:

```powershell
npm run rpc:gateway:dev
npm run rpc:gateway:inspect
```

Or run it from `tsn-protocol/services/tsn-rpc-gateway`:

```powershell
npm run dev
npm run inspect
```

The gateway serves HTTP JSON-RPC and WebSocket PubSub on the same host and
port. Locally use `http://127.0.0.1:8787` and
`ws://127.0.0.1:8787/ws`. Set `TSN_RPC_WS_URL` explicitly if the Cranker cannot
derive the corresponding WebSocket endpoint. It must not assume a separate
adjacent port.

## Readiness

The SDK reports the selected endpoint as configured and probes its health.
The Cranker performs `getVersion` and Mother Escrow account validation against
the same endpoint before it leases work. A healthy HTTP `/getHealth` response
alone does not prove account reads or transaction submission are working.
Gateway upstream health and failover are handled inside the gateway; client
fallback to a different RPC is disabled.
