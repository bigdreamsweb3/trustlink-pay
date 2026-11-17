# core / worker

Drain Receiver work after a wake, renew the same claim generation, cancel verification on lease loss, and report signed decisions. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [_renew_receiver_node_lease](renew_receiver_node_lease.py): Renew receiver node lease. See the named validation/return operations in its dedicated implementation.
- [_verify_and_report_receiver_work](verify_and_report_receiver_work.py): Verify and report receiver work. See the named validation/return operations in its dedicated implementation.
- [_process_receiver_work_with_lease](process_receiver_work_with_lease.py): Process receiver work with lease. See the named validation/return operations in its dedicated implementation.
- [receiver_verification_worker](receiver_verification_worker.py): Receiver verification worker. See the named validation/return operations in its dedicated implementation.
- [_receiver_work_by_id](receiver_work_by_id.py): Receiver work by id. See the named validation/return operations in its dedicated implementation.
- [_receiver_verified_payload](receiver_verified_payload.py): Receiver verified payload. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
