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

For a local gateway, use `http://127.0.0.1:8787`. The SDK validates and uses
the selected RPC endpoint. Cranker also uses that endpoint, with its existing
same-cluster funding retry after `BlockhashNotFound`; `TSN_RPC_FALLBACK_URL`
selects that retry endpoint. Network status describes
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

Native Cranker submission carries the confirmed blockhash read's context slot into `sendTransaction` and block-height polling as `minContextSlot`. A lagging bank can return RPC `-32016` (minimum context slot not reached); the gateway tries the next provider with the exact request. The minimum slot prevents reads/submission below that context but does not prove fork agreement or extend a signed hash's lifetime.

New owner-signed funding carries `senderFundingBlockhashContext` through XP, SDK, Receiver, Node and Cranker. It contains the exact prepared `blockhash`, positive safe-integer `lastValidBlockHeight` and nonnegative safe-integer `contextSlot`. Node checks the hash in the signed wire before independent authorization and simulates unchanged bytes at that minimum slot. Cranker checks the Node-signed projection and wire again before confirmed preflight. The tuple is a client-reported routing/retry hint, not an issuer signature or proof of expiry/nonexecution; confirmed funding remains governed by its exact receipt.

The gateway retries identical requests after `BlockhashNotFound`, minimum-context failures and malformed JSON-RPC envelopes. Valid `result: null` and scalar results remain valid envelopes. Logs correlate issuance, simulation and submission through a short SHA-256 blockhash fingerprint, provider hostname, requested minimum slot and returned context/lifetime where available. They do not print signed transaction wires or provider credentials. HTTP 200 can still contain a simulation rejection or JSON-RPC error; the event label reflects that distinction.

Node keeps hash unavailability within the reported lifetime retryable. Terminal hash rejection requires every configured endpoint to reject it explicitly and successfully report a height beyond that lifetime. Partial transport, context or height failure remains availability uncertainty. Neither branch proves whether the original transaction executed. Reload the affected Gateway, Receiver, Node, Cranker and XP processes after building the current SDK/browser bundle; this repair needs no program deployment or account migration. Inspect existing work/signatures before another deposit.

The SDK reports the selected endpoint as configured and probes its health.
The Cranker performs `getVersion` and Mother Escrow account validation against
the same endpoint before it leases work. A healthy HTTP `/getHealth` response
alone does not prove account reads or transaction submission are working.
Gateway upstream health and failover are handled inside the gateway; the
SDK's endpoint selection and Cranker's bounded funding retry remain separate.
