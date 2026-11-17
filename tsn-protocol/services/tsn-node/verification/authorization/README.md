# verification / authorization

Verify worker/lease authorization and preserve separately supported private payout/token permit checks. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [require_worker_api_key](require_worker_api_key.py): Require worker api key. See the named validation/return operations in its dedicated implementation.
- [lease_authorization_message](lease_authorization_message.py): Lease authorization message. See the named validation/return operations in its dedicated implementation.
- [lease_id_hash](lease_id_hash.py): Lease id hash. See the named validation/return operations in its dedicated implementation.
- [verify_lease_authorization](verify_lease_authorization.py): Verify lease authorization. See the named validation/return operations in its dedicated implementation.
- [decrypt_settlement_token](decrypt_settlement_token.py): Decrypt settlement token. See the named validation/return operations in its dedicated implementation.
- [private_payout_permit_message](private_payout_permit_message.py): Private payout permit message. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
