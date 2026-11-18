# networking / solana

Read the configured RPC contract and token-account evidence without signing or submitting transactions. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [get_token_account_balance_ui](get_token_account_balance_ui.py): Get token account balance ui. See the named validation/return operations in its dedicated implementation.
- [solana_rpc](solana_rpc.py): Solana rpc. See the named validation/return operations in its dedicated implementation.
- [funding_blockhash_candidate](funding_blockhash_candidate.py): Validate the exact canonical safe-integer issuer tuple and compute a decoded-byte fingerprint; malformed or regressing context raises `ValueError`.
- [funding_blockhash_validity](funding_blockhash_validity.py): Require an exact boolean and confirmed safe-integer bank slot at or above the issuer context.
- [funding_blockhash_height](funding_blockhash_height.py): Validate the confirmed nonnegative safe-integer height used only for unsigned preparation headroom.

The [issuance policy](funding_blockhash_issuance.py) permits three candidates, uses four-second per-endpoint RPC reads and requires 100 remaining blocks before returning a funding tuple. Each candidate needs `getLatestBlockhash`, `isBlockhashValid` and `getBlockHeight`, so the normal response adds two confirmed reads; retrying can perform up to nine RPC operations, each with the existing configured-endpoint failover. This is separate from Cranker's 20-block submission margin. No funds are reserved, signed wires are never rewritten, and neither the lifetime hint nor a height observation proves a previous transaction did not execute.

The current RPC port selects providers independently for each read. Nondecreasing `minContextSlot` prevents using a bank below observed context, but does not pin one upstream bank or establish fork agreement. Issuance fails closed with HTTP 503 when visibility, types, context or signing headroom cannot be established. `tests/test_deposit_rpc.py` verifies fresh/stale/unknown/malformed results, exact tuples, the 100-block boundary, bounded attempts and context progression using synthetic ports.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
