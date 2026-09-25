# Prototype SDK Boundary

This runbook defines what the local prototype/test UI may expose as an example
payment dApp and what must remain infrastructure-only.

## Application code

The prototype must use the canonical `@trustlink/tsn-sdk` façade for:

- private TIN identity-envelope preparation;
- TIN route resolution;
- payment authorization and intent serialization;
- wallet-to-wallet SPL transfer transaction construction;
- sponsored settlement transaction preparation;
- cross-chain route and destination validation.

The prototype must not import TCAP/TIN program clients, derive settlement PDAs,
or assemble raw settlement instructions in a payment route. Those operations
belong inside the SDK, Node, Receiver, Cranker, or program packages.

## Protocol UI scope

The Protocol UI is not an infrastructure diagnostic console. It does not load
local keypair files, run a faucet, inspect TCAP accounts, derive PDAs, or build
raw program instructions. Those tools belong in separate operator and test
scripts, not in the dApp example.

## Current implementation observation

The UI server has no Solana, SPL-token, TCAP, or TIN client imports. It invokes
the SDK for TIN route lookup, payment authorization, intent submission,
wallet-transfer construction, and sponsored funding construction. The browser
wallet owns signing and no private key enters the UI server.

The UI also calls `getTsnNetworkStatus` before transaction preparation. Its
default Devnet mode checks only the published or explicitly configured live
Node, Receiver, and RPC endpoints. Local integration is a separate launch mode
(`npm run protocol-tests:ui:local`) that checks only local service endpoints;
neither mode silently falls back to the other. Both modes use the same RPC for
health checks and SDK transaction construction. The UI reads Cranker liveness
from the Node's heartbeat-backed route response. The selected RPC source is
also passed to SDK route and transaction helpers, so the UI does not report a
healthy live gateway while quietly preparing transactions against a different
RPC. Native TSN actions use that core readiness only. Cross-chain actions add
the destination-route gate. A missing registered cross-chain route therefore
does not block private TIN issuance, native TIN payments, or wallet transfers.
A missing Cranker heartbeat also does not block authorization. Crankers are
discovered when they accept or process authorized work, not by a public
IP-based availability probe.
The UI labels a null Cranker count as "discovery on demand" so users do not
mistake privacy-preserving worker discovery for an outage.

Private TIN issuance remains a service-authorized flow. The UI explains that
boundary and does not fabricate a TIN or fall back to direct program creation.

## Verification

From the repository root:

```powershell
npm --prefix tsn-protocol/sdks/tsn-sdk run build
node --check protocol-tests/ui/server.mjs
```

Record the command output in the team test log when the prototype changes.
