# SDK cross-network boundary

**Status: CURRENT route-discovery scope, reviewed 2026-11-22.** The SDK cross-chain module retains generic recipient/liquidity validation and Node route discovery. Former destination registry clients, payout authorization models, proof-request methods and Cranker handoff methods are removed. No replacement adapter is implied.

Current Node discovery exposes no enabled cross-network settlement route, and admission rejects unsupported cross-network work. Applications must keep this capability boundary separate from experimental native Solana wallet-to-TIN credit and must not construct a destination executor or token from UI input.

A discovered route or generic SDK type cannot establish funding, authorization, deployment or payout. Use the [generated API](../../../tsn-protocol/tsn-docs/api-reference/sdk/modules/cross-chain.mdx) for exact current exports and the [integration plan](../../CROSS-NETWORK-PAYMENTS-BUILD-PLAN.md) for future route evidence gates.
