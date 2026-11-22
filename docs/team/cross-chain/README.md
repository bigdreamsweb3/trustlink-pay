# Cross-network integration records

**Status: PROPOSED integration work and HISTORICAL prototype evidence, reviewed 2026-11-22.** Current TSN development centers on experimental Solana wallet-to-TIN credit. Lower-fee EVM evaluation prioritizes Base, Arbitrum and Polygon; gas still applies and Ethereum Layer 1 is outside the current scope. These candidates are not enabled destination routes.

Use the [integration plan](../../CROSS-NETWORK-PAYMENTS-BUILD-PLAN.md) for present scope and evidence gates and the [source service record](../../../tsn-protocol/services/tsn-crosschain/docs/README.md) for retained research components. An adapter must establish source accounting, exact asset/recipient authorization, destination finality, liquidity, replay prevention and failure reconciliation before support can be announced.

## Preserved prototype findings

The previous destination/proof-middleware integration is retired. Its observations remain useful for route authority, exact-token checks and receipt interpretation, but its deployment, key-generation, startup and SDK submission instructions have been removed from active guidance.

- [Research and correspondent-settlement model](../../CROSS-NETWORK-PAYMENTS-RESEARCH.md)
- [Historical addresses and deployment receipts](verified-addresses.md)
- [Historical destination contract boundaries](retired-evm-direct-settlement.md)
- [Historical submitter and proof boundaries](retired-evm-cranker-adapter.md)
- [Historical explorer and deployment findings](retired-evm-navigation.md)
- [Historical test asset](usdset-deployment.md)
- [SDK route discovery boundary](sdk-cross-chain-facade.md)
- [Test UI evidence boundaries](sdk-ui-test.md)
- [Cranker runtime scope](single-cranker-runtime.md)

Use the [native-credit architecture](../../laboratory/architecture-map.md) for the current payment flow. Historical address or liquidity observations do not establish a completed native or cross-network payment.
