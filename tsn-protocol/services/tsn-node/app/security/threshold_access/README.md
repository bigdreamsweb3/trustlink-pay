# Threshold access authorization

`verify_threshold_access_request` preserves exact wallet/device canonical messages, Ed25519 signature verification, public-key fingerprints, resource binding, operation allowlists and the bounded authorized-device lifetime. `nonce_storage_key`, `threshold_request_commitment` and `create_signed_nonce_receipt` preserve their existing receipt and idempotency domains. Verification raises `ThresholdAccessError`; durable nonce consumption remains the store's responsibility.

`app.services.threshold_access` remains the public interface. Function files import focused helpers and constants directly, and import the error type locally where needed to avoid class initialization cycles. `tests/test_threshold_access.py` supplies signed local fixtures for this contract. The package does not submit transactions or provision device keys.
