# verification / intent

Parse canonical owner intent messages, validate amount/expiry/nonce fields, and enforce signature/recipient binding. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [_field](field.py): Field. See the named validation/return operations in its dedicated implementation.
- [_require_string](require_string.py): Require string. See the named validation/return operations in its dedicated implementation.
- [_decode_hash32](decode_hash32.py): Decode hash32. See the named validation/return operations in its dedicated implementation.
- [_canonical_tin_owner_intent_message](canonical_tin_owner_intent_message.py): Return the printable owner-approval message used by browser wallets.
- [_decode_base64_blob](decode_base64_blob.py): Decode base64 blob. See the named validation/return operations in its dedicated implementation.
- [_decode_owner_pubkey](decode_owner_pubkey.py): Decode owner pubkey. See the named validation/return operations in its dedicated implementation.
- [_expiry_from_input](expiry_from_input.py): Expiry from input. See the named validation/return operations in its dedicated implementation.
- [_sha256_hex_utf8](sha256_hex_utf8.py): Sha256 hex utf8. See the named validation/return operations in its dedicated implementation.
- [_encode_signed_i64_le](encode_signed_i64_le.py): Encode signed i64 le. See the named validation/return operations in its dedicated implementation.
- [_encode_u32_le](encode_u32_le.py): Encode u32 le. See the named validation/return operations in its dedicated implementation.
- [_build_canonical_message](build_canonical_message.py): Build canonical message. See the named validation/return operations in its dedicated implementation.
- [_parse_canonical_message](parse_canonical_message.py): Parse canonical message. See the named validation/return operations in its dedicated implementation.
- [_parse_usdc_base_units](parse_usdc_base_units.py): Parse usdc base units. See the named validation/return operations in its dedicated implementation.
- [_parse_canonical_expiry](parse_canonical_expiry.py): Parse canonical expiry. See the named validation/return operations in its dedicated implementation.
- [_assert_canonical_nonce_unused](assert_canonical_nonce_unused.py): Atomically consume a sender authorization nonce.
- [_assert_recipient_hash_matches_owner](assert_recipient_hash_matches_owner.py): Assert recipient hash matches owner. See the named validation/return operations in its dedicated implementation.
- [_verify_payment_authorization_from_signed_message](verify_payment_authorization_from_signed_message.py): Verify payment authorization from signed message. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
