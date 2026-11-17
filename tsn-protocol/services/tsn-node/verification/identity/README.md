# verification / identity

Resolve and validate current TIP identities/routes and retained identity-operation input contracts. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [write_recipient_route_binding](write_recipient_route_binding.py): Persist the recipient reference separately from the sender's intent.
- [private_settlement_commitment](private_settlement_commitment.py): Private settlement commitment. See the named validation/return operations in its dedicated implementation.
- [read_recipient_route_binding](read_recipient_route_binding.py): Read recipient route binding. See the named validation/return operations in its dedicated implementation.
- [get_tins_program_pubkey](get_tins_program_pubkey.py): Get tins program pubkey. See the named validation/return operations in its dedicated implementation.
- [get_private_tin_pda](get_private_tin_pda.py): Get private tin pda. See the named validation/return operations in its dedicated implementation.
- [decode_private_tin_route_material](decode_private_tin_route_material.py): Decode private tin route material. See the named validation/return operations in its dedicated implementation.
- [resolve_tin_identity_for_verification](resolve_tin_identity_for_verification.py): Open the private identity envelope for Node-side work verification.
- [read_tins_account_data](read_tins_account_data.py): Read tins account data. See the named validation/return operations in its dedicated implementation.
- [read_onchain_tin_tip_route](read_onchain_tin_tip_route.py): Resolve only the current protocol-neutral private TIN V1 TIP route.
- [_normalize_tin_operation_input](normalize_tin_operation_input.py): Normalize tin operation input. See the named validation/return operations in its dedicated implementation.
- [assert_tin_operation_can_enter](assert_tin_operation_can_enter.py): Assert tin operation can enter. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
