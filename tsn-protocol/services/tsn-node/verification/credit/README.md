# verification / credit

Prepare the current hidden-head credit against authoritative state/funding/TIP roots and matching local witnesses. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [_read_gpru_proof_accounts](read_gpru_proof_accounts.py): Read gpru proof accounts. See the named validation/return operations in its dedicated implementation.
- [_settlement_funding_context](settlement_funding_context.py): Settlement funding context. See the named validation/return operations in its dedicated implementation.
- [_construct_verified_tcap_transition](construct_verified_tcap_transition.py): Construct verified tcap transition. See the named validation/return operations in its dedicated implementation.
- [_assert_authorized_credit_preconditions](assert_authorized_credit_preconditions.py): Assert authorized credit preconditions. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
