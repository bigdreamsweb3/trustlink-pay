# TSN User-Owned Private Data

TSN coordinates encrypted private settlement records, but it does not own the authority that unlocks them. Each private receipt uses a fresh 256-bit Data Encryption Key (DEK). The receipt is encrypted with AES-256-GCM, and the DEK is independently wrapped to owner-authorized device keys and, when configured, an owner-controlled recovery credential.

TrustLink Pay, TSN Mempool, backend services, databases, Crankers, and TrustLink Labs receive ciphertext, commitments, public keys, authorization records, and wrapped DEKs. They do not receive device private keys, recovery private keys, raw DEKs, or decrypted receipts.

## Ownership boundary

```text
Owner wallet
    authorizes
        |
        v
Device signing key + device encryption key
        |                         |
        | proves requests         | unwraps receipt DEKs locally
        v                         v
TSN authorization service     TSN private renderer
        |                         ^
        | releases ciphertext     |
        v                         |
Encrypted receipt + device key envelope
```

The owner wallet is the root authorization authority. It does not become the settlement transaction signer, fee payer, or on-chain TIN authority. Wallet signatures authorize device and recovery policy changes through canonical, nonce-protected messages.

## Receipt protection

Every receipt has:

- a unique random DEK;
- a unique AES-GCM nonce;
- an explicit authentication tag;
- authenticated context binding protocol version, receipt ID, operation ID, TIN commitment, and encryption version;
- one independent key envelope per authorized device or recovery credential;
- an integrity commitment covering the encrypted payload fields.

Compromising platform storage reveals encrypted records and public authorization metadata, not the private receipt plaintext.

## Current implementation boundary

The TSN SDK owns canonical device authorization, issued-challenge verification, on-chain TINS owner verification, proof-of-possession sessions, user-owned receipt envelopes, and recovery-state contracts. The current backend process hosts replaceable TSN authorization persistence and transport adapters; TrustLink Pay login records are not an authorization source. Registration and private receipt access schemas contain public keys, commitments, ciphertext, and wrapped key envelopes only.

The legacy TrustLink Pay browser key bundle remains active only for its legacy claim flow until live SDK device enrollment and receipt backfill are verified end to end. It is not part of the TSN device authorization contract and is not deleted before that cutover. See [TSN Device Authorization](./TSN-DEVICE-AUTHORIZATION.md) for the verified responsibility boundary.

The browser limitation remains important: same-origin hostile JavaScript can instrument runtime behavior while plaintext is rendered. TSN-owned components reduce accidental application custody; they do not create cryptographic isolation from a malicious same-origin host.
