# Retained EVM prototype responsibilities

**Status: EXPERIMENTAL source only, reviewed November 22, 2026.** This directory contains disconnected research components. It has no source-to-destination settlement runtime, proof worker or deployment workflow. Native wallet-to-TIN credit remains governed by Solana's TIP, TSNP, TCAP and GPRU contracts; these prototypes do not modify that flow.

`DestinationRegistry.sol` models signed route proposals, voting and delayed admission. `DestinationLiquidityRegistry.sol` stores route identities and observations submitted by designated authorities. Its retained `liquidityASC`, hub and outbox fields describe the prototype's original ABI; the corresponding executable verifier/hub/transport implementation is removed, so those fields do not identify a supported current integration.

`TSNERCLiquidityVault.sol` restricts ERC20 release to a configured executor and preserves owner funding, unused-liquidity withdrawal and executor governance. `tokens/USDSET.sol` is an owner-mintable research token with six decimals and no claimed backing. `SepoliaAnchor.sol` is historical evidence-tuple research and grants no current Ethereum L1 support. Their source/account responsibilities are retained for review without providing an active TSN adapter.

The TypeScript liquidity helpers validate supplied addresses, route IDs, positive amounts and observation freshness. They do not verify a chain proof or reserve tokens. The SDK separately offers Node route discovery and local recipient/liquidity validators. Node currently returns no external routes and rejects external signed-intent admission before network access; Cranker only accepts its native authorized settlement families.

A future Base, Arbitrum or Polygon adapter needs an explicitly adopted source-authentication and destination-execution contract, concrete asset/liquidity policy, replay/finality rules, costs, recovery and observed test evidence. Naming a target, retaining a prototype or compiling source satisfies none of those requirements by itself.
