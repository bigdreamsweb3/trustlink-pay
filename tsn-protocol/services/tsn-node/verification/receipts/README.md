# verification / receipts

Produce deterministic Node evidence/execution projections and signed decision receipts. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [get_settlement_authorization_signing_key](get_settlement_authorization_signing_key.py): Get settlement authorization signing key. See the named validation/return operations in its dedicated implementation.
- [_stable_verification_json](stable_verification_json.py): Match Receiver stable JSON for signing Node verification evidence.
- [_node_verification_signing_key](node_verification_signing_key.py): Node verification signing key. See the named validation/return operations in its dedicated implementation.
- [_node_verification_message](node_verification_message.py): Node verification message. See the named validation/return operations in its dedicated implementation.
- [_public_coordination](public_coordination.py): Public coordination. See the named validation/return operations in its dedicated implementation.
- [_sign_node_verification](sign_node_verification.py): Sign node verification. See the named validation/return operations in its dedicated implementation.
- [settlement_authorization_signer_pubkey](settlement_authorization_signer_pubkey.py): Settlement authorization signer pubkey. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
