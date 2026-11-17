# verification / encoding

Encode/decode the existing base58 and secret-key formats with their original validation and errors. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [encode_base58](encode_base58.py): Encode base58. See the named validation/return operations in its dedicated implementation.
- [decode_base58](decode_base58.py): Decode base58. See the named validation/return operations in its dedicated implementation.
- [decode_secret_key](decode_secret_key.py): Decode secret key. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
