# transactions / native / validation

Validate exact credit field encodings, digest bindings, account preconditions, and transport capacity. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [_tcap_credit_bytes32](tcap_credit_bytes32.py): Tcap credit bytes32. See the named validation/return operations in its dedicated implementation.
- [_tcap_credit_u64](tcap_credit_u64.py): Tcap credit u64. See the named validation/return operations in its dedicated implementation.
- [_read_tcap_shared_replay_root](read_tcap_shared_replay_root.py): Read tcap shared replay root. See the named validation/return operations in its dedicated implementation.
- [_validate_tcap_credit_digest](validate_tcap_credit_digest.py): Validate tcap credit digest. See the named validation/return operations in its dedicated implementation.
- [_assert_tcap_gpru_credit_program_preconditions](assert_tcap_gpru_credit_program_preconditions.py): Check TCAP config, shared replay root and asset accounts before authorization.
- [_public_tcap_transition](public_tcap_transition.py): Public tcap transition. See the named validation/return operations in its dedicated implementation.
- [_tcap_credit_v1_wire_size](tcap_credit_v1_wire_size.py): Tcap credit v1 wire size. See the named validation/return operations in its dedicated implementation.
- [_assert_tcap_credit_transport_capacity](assert_tcap_credit_transport_capacity.py): Assert tcap credit transport capacity. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
