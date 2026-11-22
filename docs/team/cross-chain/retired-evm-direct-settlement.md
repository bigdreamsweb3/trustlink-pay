# Historical EVM destination prototype

**Status: RETIRED integration, recorded here for engineering history on 2026-11-22.** The former destination route used a Solana debit commitment, Node-issued EIP-712 authorization, a destination hub, registry, executor and prefunded ERC-20 vault. It is excluded from current runtime and does not establish an adapter on Base, Arbitrum or Polygon.

## Useful contract findings

The route mirror was a preflight hint. The destination registry supplied the exact executor and payout token; UI symbols or configuration could not substitute another asset. The hub checked authorization, route, expiry and replay before invoking the executor, which released only from its configured vault. Destination liquidity was independent of the operator's native gas balance.

Earlier BTKT observations showed zero vault balance. A later USDSET route recorded an active registry and 1,000,000 units of the six-decimal test token in its vault. These were successive observations, not proof of a source debit followed by recipient payout. The [historical evidence register](verified-addresses.md) preserves the recorded addresses and transaction hashes without admitting them as active routes.

The former direct path and proof-middleware onward path were distinct prototypes. A future destination integration requires a fresh contract review and complete source/destination evidence under the [current plan](../../CROSS-NETWORK-PAYMENTS-BUILD-PLAN.md); no deployment or route migration is authorized by this historical note.
