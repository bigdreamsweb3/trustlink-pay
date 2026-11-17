# transactions / native / signing

Inspect the native message and current lease, obtain its final blockhash, and use Mother authority only after the final synchronous checks. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [_mother_authority_signing_key](mother_authority_signing_key.py): Mother authority signing key. See the named validation/return operations in its dedicated implementation.
- [_assert_mother_authority_key_matches_chain](assert_mother_authority_key_matches_chain.py): Assert mother authority key matches chain. See the named validation/return operations in its dedicated implementation.
- [_verify_mother_signed_tcap_settlement_message](verify_mother_signed_tcap_settlement_message.py): Verify mother signed tcap settlement message. See the named validation/return operations in its dedicated implementation.
- [_assert_unsigned_native_settlement](assert_unsigned_native_settlement.py): Assert unsigned native settlement. See the named validation/return operations in its dedicated implementation.
- [_native_blockhash_lifetime](native_blockhash_lifetime.py): Native blockhash lifetime. See the named validation/return operations in its dedicated implementation.
- [sign_settlement_transaction](sign_settlement_transaction.py): Validate leased native settlement and sign its freshly hashed V1 message.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
