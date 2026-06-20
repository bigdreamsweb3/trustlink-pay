# Passkey Wallet Package

This package supports passkey-based wallet experiments for TrustLink Pay.

## What Is This?

Passkeys are device-backed authentication credentials.

They can make login or wallet authorization feel more familiar to users who do not want to manage seed phrases directly.

## Why It Exists

TrustLink Pay aims to make payments easier for non-technical users.

Passkeys can help reduce friction, but they must be implemented carefully because payment authorization is security-sensitive.

## Important Limits

This package should not weaken wallet ownership rules.

Any passkey flow must clearly separate:

- login
- identity management
- payment authorization
- wallet custody

## Related Docs

- `docs/SECURITY.md`
- `docs/DEVELOPER.md`
