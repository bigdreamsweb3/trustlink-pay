# TSN Legacy Browser-Key Migration

TrustLink Pay currently stores an application-owned privacy key bundle in browser `localStorage` under `trustlink:privacy-key-bundle:v1`. The live legacy claim flow still reads these keys. Deleting the bundle before claim and historical receipt cutover would strand eligible legacy funds or records.

## Controlled migration gate

For each browser profile containing the legacy bundle:

1. Detect the bundle without transmitting it.
2. Require owner wallet proof bound to the TIN, network, new device keys, nonce, expiry, audience, and migration purpose.
3. Generate SDK-owned non-exportable signing and encryption credentials.
4. Register the device after owner authorization validation and nonce consumption.
5. Use the legacy key locally only to recover eligible historical material.
6. Rewrap recovered receipt DEKs to the new device and optional recovery credential.
7. Decrypt and verify the migrated receipt set locally.
8. Confirm the final claim path no longer imports `frontend/src/lib/privacy-keys.ts`.
9. Delete `trustlink:privacy-key-bundle:v1` only after every required verification succeeds.
10. Remove the legacy key generation, upload, derivation, and claim code.

## Failure behavior

Any registration, rewrapping, verification, or claim-cutover failure leaves the legacy bundle untouched and reports a recoverable migration error. The migration must never upload the legacy private keys or mark migration complete merely because a device record was created.

## Current status

The SDK user-owned envelope and authorization foundations are implemented and tested. The live claim flow still depends on the legacy bundle, so automatic deletion is intentionally not active. This document is the required gate for the later TrustLink Pay cutover.
