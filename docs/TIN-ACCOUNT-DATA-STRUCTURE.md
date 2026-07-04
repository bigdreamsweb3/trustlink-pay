# TIN Account Data Structure

## What a TIN Account Stores

A TIN account is the on-chain identity record for a Transfer Identity Number. It is stored as a Program Derived Address on Solana. It is the public record that links a TIN number to its owner, but it does this without exposing the owner's wallet address or any private data in readable form.

Reference lookup output:

```text
TIN Number:              1000000008
Display Name:            Big Dreams Web3
Owner Pubkey Hash:       b14e707211c42fe5fe2f7f80c390cc7656dc54410e0966b9c862e325b2d6b732
Encrypted Master Seed:   62 bytes (AES-256-GCM encrypted)
Encrypted Metadata Hash: e16db8af7f7d234c943b4591d7e7d99f1383761543132ed0b10cf1b572e9e5ed
PRU Config Hash:         ccae7152c6a4b8853b612792692aa50c492271d77dd9c5c98645cd5efd127746
```

The visible account data is intentionally small. Public identity fields are readable because users share them for payment discovery. Sensitive identity and routing data is stored only as encrypted data or one-way commitments.

## Field Explanations

### TIN Number

Type: Public by design.

What it contains: The user's 10-digit Transfer Identity Number. This is the identifier users share to receive payments, the equivalent of a phone number in traditional mobile money systems like OPay or UPI, but for blockchain payments.

What it protects: Nothing. It is intentionally public. A TIN number on its own reveals nothing about the owner's wallet, phone number, or receiving addresses.

### Display Name

Type: Public by design.

What it contains: The human-readable name the user registered with their TIN, for example "Big Dreams Web3."

What it protects: Nothing. It is intentionally public and user-chosen. It is the equivalent of a username.

### Owner Pubkey Hash

Type: One-way SHA-256 hash. Cannot be reversed or decrypted.

What it contains: A SHA-256 fingerprint of the owner's main wallet public key. The raw wallet address is never stored. Only this fingerprint is stored.

What it protects against: This design means a blockchain observer reading the TIN account cannot identify which wallet owns the TIN. They see a 64-character hex hash that cannot be reversed into a wallet address by any known mathematical method. The only way to prove ownership is to produce an Ed25519 signature from the wallet that hashes to this value, something only the legitimate owner can do.

### Encrypted Master Seed

Type: AES-256-GCM encrypted data. Can only be decrypted by the legitimate TIN owner.

What it contains: The TIN Master Seed, 32 bytes of pure cryptographically secure random data generated at TIN creation time. This seed is used to deterministically derive all 30 PRU (Privacy Receiving Unit) wallet addresses linked to this TIN.

How decryption works: The decryption key is derived from two things combined: the owner's main wallet signature and the owner's PIN. Both are required simultaneously. Neither is stored anywhere in the system. This means:

- TrustLink cannot decrypt it.
- The TSN mempool cannot decrypt it.
- Crankers cannot decrypt it.
- Blockchain observers cannot decrypt it.
- Only the legitimate TIN owner on their own device can decrypt it.

Why it is stored on-chain: Cross-device recovery. When a user moves to a new device they connect their wallet, enter their PIN, and the SDK fetches this encrypted blob from the chain and decrypts it locally. All 30 PRU addresses are re-derived deterministically from the recovered seed. No seed phrases, no manual imports, no support required.

The critical security property: The TIN Master Seed has zero mathematical relationship to the owner's wallet private key or any signature the wallet produces. A malicious application that tricks a user into signing messages cannot extract or derive the master seed from those signatures. The seed is purely random and independent.

### Encrypted Metadata Hash

Type: One-way SHA-256 hash. Cannot be reversed or decrypted.

What it contains: A SHA-256 fingerprint of the TIN's registration metadata, including the hashed phone number, display name, and other registration details combined.

What it protects against: Tamper detection during TIN creation and upgrade. When a TIN upgrade intent is submitted to the TSN mempool, the cranker verifies that the metadata in the intent produces a hash matching this on-chain commitment. If anyone tampered with the metadata between submission and on-chain storage, the hashes will not match and the cranker rejects the operation. No metadata changes can be silently applied.

Important note: This is not encrypted data. It is a one-way fingerprint. There is nothing inside it to read or decrypt. It exists purely for verification.

### PRU Config Hash

Type: One-way SHA-256 hash. Cannot be reversed or decrypted.

What it contains: A SHA-256 fingerprint of all 30 PRU wallet addresses combined. The actual PRU addresses are never stored on-chain. Only this fingerprint of them is stored.

The mathematical relationship: The PRU Config Hash and the Encrypted Master Seed are cryptographically bound to each other in one direction:

```text
TIN Master Seed
      -> deterministic derivation
30 PRU public key addresses
      -> SHA-256 of all 30 combined
PRU Config Hash (stored on-chain)
```

This relationship is one-way and non-reversible. Given the PRU Config Hash alone, it is mathematically impossible to derive the PRU addresses or the Master Seed. Given the Master Seed, the same 30 PRU addresses and the same hash are always produced every time, on any device, by the authorized owner.

The safety deposit box analogy is useful here. The encrypted seed is like the locked key to a set of boxes. The PRU Config Hash is like a sealed fingerprint card for the boxes. Anyone can check that the right boxes match the fingerprint, but nobody can open the boxes or recreate the keys from the fingerprint card.

How the settlement path uses it: Every time a payment settles to a TIN, the verification sequence is:

1. Read the PRU Config Hash from the on-chain TIN account.
2. Resolve the authorized PRU route for that TIN.
3. Compute SHA-256 of the 30 route addresses.
4. Compare the result against the on-chain PRU Config Hash.
5. If they match, proceed with settlement to the selected PRU.
6. If they do not match, reject the settlement entirely.

What it protects against: Three specific attacks:

Attack one: Fake PRU injection. A malicious operator cannot claim that a TIN's PRUs are addresses it controls because the on-chain hash will not match any set of addresses not derived from the legitimate master seed.

Attack two: PRU substitution during upgrade. If someone intercepts a TIN upgrade intent and swaps in different PRU addresses, the verification path computes a different hash from those addresses and rejects the settlement because it does not match the on-chain commitment.

Attack three: Replay of old PRU set. After a TIN upgrade, the old PRU Config Hash is replaced by a new one. Old PRU addresses cannot be used for new settlements because they will not produce a hash matching the updated commitment.

## What a Blockchain Observer Can and Cannot Learn

| Always visible to any observer | Never visible to any observer |
| --- | --- |
| TIN number | The owner's wallet address |
| Display name | The owner's phone number |
| Hash commitments | The 30 PRU wallet addresses |
| Encrypted seed blob as opaque bytes | The TIN Master Seed |
| Account existence and account size | The registration metadata contents |

The key insight is simple: every sensitive piece of information is either hashed beyond reversal or encrypted beyond decryption without the owner's active participation. A blockchain observer reading the TIN account in full sees only what the owner chose to make public, the TIN number and display name, plus a set of cryptographic commitments that reveal nothing about identity, receiving addresses, or payment history.

## Why This Design Cannot Be Weakened

The privacy guarantees of the TIN account data structure are enforced at the program level, not at the application level.

This means:

- TrustLink's frontend could be replaced with another interface and the privacy model would remain intact.
- The TSN mempool could be breached without exposing the owner's wallet address from the TIN account because the registry stores only a hash commitment.
- Even if route metadata is attacked, the encrypted master seed stored on-chain cannot be decrypted without the owner's wallet signature and PIN simultaneously.
- The cranker network cannot settle to fake PRUs because the on-chain PRU Config Hash is the validator for the authorized route.

The program is the privacy guarantee. Not the application. Not the API. Not the SDK. The Solana program itself enforces what gets stored and what verification must pass before any operation succeeds.
