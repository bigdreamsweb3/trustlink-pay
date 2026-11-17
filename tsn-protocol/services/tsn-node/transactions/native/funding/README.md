# transactions / native / funding

Validate immutable owner-signed deposits and their confirmed funding evidence. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [_simulate_owner_signed_tcap_deposit](simulate_owner_signed_tcap_deposit.py): Ask the configured Solana program to validate the exact signed deposit without submitting it.
- [_parse_signed_tcap_deposit_instructions](parse_signed_tcap_deposit_instructions.py): Parse signed tcap deposit instructions. See the named validation/return operations in its dedicated implementation.
- [_select_tcap_private_funding_deposit](select_tcap_private_funding_deposit.py): Allow wallet compute settings without permitting another funding action.
- [_verify_signed_tcap_deposit_contract](verify_signed_tcap_deposit_contract.py): Verify signed tcap deposit contract. See the named validation/return operations in its dedicated implementation.
- [_verify_confirmed_tcap_deposit](verify_confirmed_tcap_deposit.py): Verify confirmed tcap deposit. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
