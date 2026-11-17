# verification / accounting

Coordinate the separate complete credit-epoch accounting operation and validate its authorized message. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

Credit-epoch verification and authorization receive the `prove_epoch` callable through that port. The production runtime binds the existing aggregate prover; isolated component tests can supply an async replacement to verify witness, proof and lease handling without loading proving artifacts.

## Public components

- [_current_credit_epoch](current_credit_epoch.py): Current credit epoch. See the named validation/return operations in its dedicated implementation.
- [_coordinate_private_credit_work](coordinate_private_credit_work.py): Coordinate private credit work. See the named validation/return operations in its dedicated implementation.
- [_verify_private_coordination_work](verify_private_coordination_work.py): Verify private coordination work. See the named validation/return operations in its dedicated implementation.
- [_authorize_private_coordination](authorize_private_coordination.py): Authorize private coordination. See the named validation/return operations in its dedicated implementation.
- [_verify_private_coordination_message](verify_private_coordination_message.py): Verify private coordination message. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
