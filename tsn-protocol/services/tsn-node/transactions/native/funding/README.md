# transactions / native / funding

Validate immutable owner-signed deposits and their confirmed funding evidence. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions for the original active-server functions are recorded in [the contract map](../../../core/component_contracts.json). [The inventory](../../../core/component_inventory.json) also records new helpers and their static test references. Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [_simulate_owner_signed_tcap_deposit](simulate_owner_signed_tcap_deposit.py): Validate the exact signed deposit with confirmed commitment, signature verification, unchanged blockhash and the required minimum bank slot. Unknown availability or hash rejection within the client-reported lifetime remains retryable; terminal hash rejection requires every configured bank's explicit rejection and observed height beyond that lifetime.
- [prepare_funding_deposit_accounts](prepare_funding_deposit_accounts.py): Before funding approval, read the registered TCAP reserve/vault/configuration and an active owner token account with sufficient advisory balance. Returns the ten-address SDK deposit map without issuing a blockhash or reserving funds. Invalid bindings or insufficient balance reject readiness; RPC availability remains retryable.
- [funding_account_data](funding_account_data.py): Decode required account data with explicit owner, minimum layout and optional Anchor discriminator; malformed data raises a bounded validation error.
- [_funding_blockhash_context](funding_blockhash_context.py): Validate the exact three-field hash/lifetime/slot tuple and bind its canonical nonzero hash to the signed wire before completion or final simulation.
- [_funding_blockhash_bank_height](funding_blockhash_bank_height.py): Read a rejecting bank's confirmed height at the minimum slot for routing/retry diagnostics; this does not prove nonexecution.
- [_parse_signed_tcap_deposit_message](parse_signed_tcap_deposit_message.py): Parse the bounded legacy signed-wire header, keys and blockhash for instruction validation and hash binding.
- [_parse_signed_tcap_deposit_instructions](parse_signed_tcap_deposit_instructions.py): Parse signed tcap deposit instructions. See the named validation/return operations in its dedicated implementation.
- [_select_tcap_private_funding_deposit](select_tcap_private_funding_deposit.py): Allow wallet compute settings without permitting another funding action.
- [_verify_signed_tcap_deposit_contract](verify_signed_tcap_deposit_contract.py): Verify signed tcap deposit contract. See the named validation/return operations in its dedicated implementation.
- [_verify_confirmed_tcap_deposit](verify_confirmed_tcap_deposit.py): Verify confirmed tcap deposit. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
