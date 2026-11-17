# networking / liquidity

Scan public CrankerVault/token liquidity and maintain the explicitly owned cache. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [get_program_accounts](get_program_accounts.py): Get program accounts. See the named validation/return operations in its dedicated implementation.
- [read_onchain_cranker_vaults](read_onchain_cranker_vaults.py): Discover CrankerVault accounts from the TSN program and read their public fields.
- [read_public_vault_liquidity](read_public_vault_liquidity.py): Read public vault liquidity. See the named validation/return operations in its dedicated implementation.
- [read_public_vault_liquidity_cached](read_public_vault_liquidity_cached.py): Read vault liquidity from Solana RPC at most once per epoch by default.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
