# External settlement admission

**Status: CURRENT disabled boundary, November 22, 2026.** `ready_destination_networks` returns an empty list. `verify_destination_route` rejects every external destination before registry RPC or debit authorization; inherited route configuration cannot enable one. Native Solana funding and private credit keep their existing contracts.

`app.services.cross_chain_routes` exports these two functions for Node discovery and signed-intent admission. The former registry parser, RPC/ABI decoder, payout model and optional receipt/proof worker were removed. Base, Arbitrum and Polygon remain planning targets requiring independently implemented and verified adapters; Ethereum L1 is outside the current integration scope.

`tests/test_cross_chain_routes.py` checks stale-configuration isolation, rejection before network access and empty public discovery. Passing these local tests establishes this admission boundary only; it does not prove a cross-network payment or future adapter readiness.
