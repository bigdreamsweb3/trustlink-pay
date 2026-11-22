# TSN EVM research boundary

**Status: EXPERIMENTAL retained prototypes, November 22, 2026. No enabled cross-network settlement route.** TSN's active implementation work is on Solana Devnet. Base, Arbitrum and Polygon are intended lower-fee EVM integration targets; Ethereum L1 is outside the current integration scope. These targets do not represent a deployed adapter or completed payment.

The former intermediary-chain hub, direct payout/executor, proof workers and deployment/configuration commands are removed. Node's `/settlement-networks` operation returns an empty list, its external-route admission rejects before RPC or debit authorization, and Cranker has no external payout handler. A stale private environment entry or old deployment record cannot restore that runtime.

## Retained source

`src/destination-liquidity.ts` contains local route/observation validators and route-ID derivation for research. The Solidity inventory retains `DestinationRegistry`, `DestinationLiquidityRegistry`, `TSNERCLiquidityVault`, the mintable test asset `USDSET`, and historical `SepoliaAnchor`. None is wired to current TSN settlement. Registry signatures and supplied liquidity observations alone do not establish source-chain acceptance or destination execution. USDSET has no asserted fiat backing, redemption or official stablecoin issuer relationship.

See [the source boundary](architecture.md) for the responsibilities of these prototypes and [the protocol integration guidance](../../../tsn-docs/sdk/integrations.mdx) for current public capability status. Existing private keys, deployment records and live environment files are preserved; this source retirement does not reverse previous chain state.

## Offline validation

The package's `npm run build` command checks TypeScript without emitting artifacts, starting services or executing deployment. Solidity compilation is a separate check and does not establish deployment or settlement. There is no retained deployment command or live EVM test command in this package. Future adapters require their own reviewed authentication, replay, finality, liquidity, fee and recovery contracts plus bounded end-to-end evidence before Node admits them.
