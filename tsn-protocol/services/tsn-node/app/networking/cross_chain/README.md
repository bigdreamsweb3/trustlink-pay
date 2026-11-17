# Creditcoin destination registry

`load_destination_routes` preserves exact configured registry, route ID, destination chain, RPC, optional executor and optional token fields. `verify_destination_route` checks current registry activation, exact on-chain chain/executor/token identity and an unexpired liquidity observation covering the requested amount. `ready_destination_networks` retains its amount-one readiness probe; admission still checks the full intent amount. Configuration alone does not establish live support.

`app.services.cross_chain_routes` remains the public interface. Network functions use HTTP at call time; configuration and ABI-word helpers are pure local operations. Patch `_eth_call` in `app.networking.cross_chain.verify_destination_route` when isolating that function. `tests/test_cross_chain_routes.py` covers configured mirrors and word/address decoding without contacting a chain.
