# Opaque route signatures

`canonical_route_message` binds work identity, opaque route commitment, mint, amount, expiry and program identifier. `canonical_route_amount` preserves the shared decimal spelling required by Python and JavaScript consumers. `sign_route_message` returns `OpaqueRouteAuthorization`; `verify_route_message` validates its Ed25519 signature.

`app.services.route_attestation` remains the public interface. The signing key is an explicit caller dependency, and the package performs no chain reads or durable writes. `tests/test_route_attestation.py` covers canonical amount/message handling and local signature verification.
