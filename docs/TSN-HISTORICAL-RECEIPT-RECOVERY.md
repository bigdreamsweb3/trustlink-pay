# TSN Historical Receipt Recovery

## Historical access policy

A newly authorized device automatically participates in receipt wrapping from its authorization time forward. Historical receipts remain encrypted to their original authorized recipients until the owner explicitly approves recovery.

The SDK distinguishes three cases:

- no historical private records exist;
- historical records exist and recovery is available;
- historical records exist but neither an authorized device nor recovery credential can restore them.

It never represents inaccessible history as an empty transaction history.

## Existing-device restoration

The existing device validates the new device authorization, TIN commitment, recovery scope, nonce, and expiry. It unwraps each eligible receipt DEK locally and creates a new X25519/HKDF-SHA256/AES-256-GCM envelope for the new device. Receipt ciphertext and plaintext are not uploaded during rewrapping.

Supported policy scopes are:

- `all`;
- `recent`;
- `selected`;
- `future-only`.

`all` is the recommended product choice, but it requires explicit owner confirmation.

## Recovery credential restoration

An owner-controlled recovery encryption key may receive its own envelope when a receipt is created. On a new device, wallet ownership and device authorization occur before the recovery credential is used. The recovery private key remains controlled by the user and performs local DEK recovery.

## Unrecoverable history

If every authorized device and recovery credential is lost, historical receipts without another owner-controlled envelope are cryptographically unrecoverable. TSN reports that state directly. Future records remain protected under the newly authorized device.
