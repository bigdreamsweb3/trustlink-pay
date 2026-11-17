# storage / coordination

Select the configured durable/test storage port and preserve state keys, route bindings, and epoch coordination records. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [get_store](get_store.py): Get store. See the named validation/return operations in its dedicated implementation.
- [get_mempool_store](get_mempool_store.py): Get mempool store. See the named validation/return operations in its dedicated implementation.
- [k_intents](k_intents.py): K intents. See the named validation/return operations in its dedicated implementation.
- [k_epoch](k_epoch.py): K epoch. See the named validation/return operations in its dedicated implementation.
- [k_crankers](k_crankers.py): K crankers. See the named validation/return operations in its dedicated implementation.
- [k_tin_operation_nonces](k_tin_operation_nonces.py): K tin operation nonces. See the named validation/return operations in its dedicated implementation.
- [k_canonical_message_nonces](k_canonical_message_nonces.py): K canonical message nonces. See the named validation/return operations in its dedicated implementation.
- [k_threshold_access_nonces](k_threshold_access_nonces.py): K threshold access nonces. See the named validation/return operations in its dedicated implementation.
- [k_recipient_route_binding](k_recipient_route_binding.py): K recipient route binding. See the named validation/return operations in its dedicated implementation.
- [hget_all_json](hget_all_json.py): Hget all json. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
