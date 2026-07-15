# TSN Device Recovery Architecture

## Device credentials

An authorized device has two distinct credentials:

- a non-exportable Ed25519 signing key for request proof of possession;
- a non-exportable X25519 encryption key for receipt-key envelopes.

Only public JWK material and cryptographic fingerprints are registered with TSN. Private `CryptoKey` objects remain on the device and are not serialized into JSON or `localStorage`.

## Owner authorization

The owner signs a deterministic `TSN_OWNER_DEVICE_AUTHORIZATION` message containing:

- protocol version and domain;
- network and audience;
- TIN and owner identity commitments;
- device signing and encryption key fingerprints;
- sorted permission scope;
- history recovery scope;
- nonce, issue time, and expiry.

Changing any bound value invalidates the signature. A consumed nonce cannot authorize the device again.

## Recovery priority

1. An existing authorized device unwraps each permitted historical DEK locally and rewraps it to the new device.
2. An owner-controlled recovery credential unwraps permitted DEKs and restores access locally.
3. If neither exists, TSN reports an explicit unrecoverable-history state. The new device still receives future receipts.

No Mempool, backend, or platform master key exists in this architecture.

## Revocation

A revoked device cannot create a session, retrieve new encrypted records, approve recovery, receive new key envelopes, or participate in future receipt wrapping. Revocation does not erase plaintext or keys that a device legitimately received while authorized.

After a security incident, future receipts use the remaining active device and recovery recipients. Existing envelopes may be marked revoked in platform storage, but previously obtained key material cannot be remotely erased.
