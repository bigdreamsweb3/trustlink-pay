# core / archive

Preserve the separate off-chain queue epoch, GitHub archive projection, and unresolved-work rollover. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [read_epoch_state](read_epoch_state.py): Read epoch state. See the named validation/return operations in its dedicated implementation.
- [parse_iso](parse_iso.py): Parse iso. See the named validation/return operations in its dedicated implementation.
- [next_close_for_state](next_close_for_state.py): Next close for state. See the named validation/return operations in its dedicated implementation.
- [is_epoch_due](is_epoch_due.py): Is epoch due. See the named validation/return operations in its dedicated implementation.
- [build_epoch_status](build_epoch_status.py): Build epoch status. See the named validation/return operations in its dedicated implementation.
- [commit_epoch_to_github](commit_epoch_to_github.py): Commit epoch to github. See the named validation/return operations in its dedicated implementation.
- [close_epoch_task](close_epoch_task.py): Close epoch task. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
