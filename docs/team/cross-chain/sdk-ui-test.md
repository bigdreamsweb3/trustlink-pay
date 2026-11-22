# Cross-network UI evidence checks

**Status: CURRENT capability boundary with HISTORICAL findings, reviewed 2026-11-22.** The Node route-discovery result contains no enabled cross-network destination. A UI should explain that status and link the [integration plan](../../CROSS-NETWORK-PAYMENTS-BUILD-PLAN.md), rather than display a ready payout route for a planned network.

Earlier prototype testing found a live test-token registry/liquidity observation while the running Node exposed zero routes. Those were different evidence boundaries: destination RPC readiness did not prove Node admission, and neither proved a source debit or recipient payout. Token values must be formatted using exact decimals; 1,000,000 whole units of a six-decimal test asset correspond to 1,000,000,000,000 base units.

Former registry snapshot examples and restart instructions are retired. Validate native wallet-to-TIN funding, settlement and owner-history results independently using the [current flow](../../laboratory/architecture-map.md), with user-controlled services and transaction approvals.
