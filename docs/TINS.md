# TINS

TINS means **Transfer Identity Number System**.

It gives a user a 10-digit payment identity called a **TIN**.

## What Is This?

A TIN is a number that can be shared instead of a wallet address.

Example:

```text
1000000008
```

The TIN is the public payment identity. Wallets, social accounts, and verification records can be linked behind it.

TINS are designed around a simple privacy principle: people should be discoverable by the identities they choose to share, not by the identities others search for.

Identity fields such as social profiles and legal names can be stored in encrypted form within the registry. Once a sender has a recipient's 10-digit TIN, they can resolve and verify the identity information associated with that TIN. However, someone browsing the public registry cannot easily work backwards from a name, social handle, or public profile to discover the recipient's TIN.

This prevents a public payment identity from becoming a public directory. The TIN becomes the key that unlocks confidence, rather than personal information becoming the key that unlocks the TIN.


## Why It Exists

Wallet addresses are not friendly for everyday payments.

They are long, easy to mistype, and once shared they can expose a lot of activity. A TIN gives users a simpler identity that can move across apps and wallets.

## How It Works

TINS stores identity records on Solana.

The record can include:

- the TIN number
- the owner or authority
- a public display name if one exists
- verification status
- encrypted social identities
- sensitive fields that require explicit user authorization to decrypt
- platform verification proof references

The protocol should show a clear difference between:

- a verified legal or registry name
- and social profile name

If a TIN has no verified name, the UI should say so plainly.

## Social Identity Encryption

Social identities are optional links such as WhatsApp, email, or X.

These records are encrypted before storage. The TIN can be used as part of the public decryption path for social identity records that are intended to be resolvable by someone who knows the TIN.

Sensitive records use a stronger rule. They require the TIN plus a fresh user signature before they can be decrypted.

## Verification Platforms

Verification platforms are trusted services that can sign identity proofs.

The TINS program supports a platform registry so the protocol can check whether a proof came from an authorized platform key. Platforms can rotate keys over time.

## Example Flow

1. A user creates a TIN.
2. The user links a wallet.
3. The user may link WhatsApp or another social identity.
4. A verification platform signs proof that the identity link is valid.
5. TINS stores the encrypted identity link and proof reference.
6. A sender resolves the TIN before payment.
7. The app shows safe public identity details.

## Security Considerations

- A TIN is public.
- Do not store private documents in plaintext.
- Do not expose phone numbers as public profile data unless the user explicitly allowed that use.
- Use platform-signed proofs for verification.
- Show users which name source is being displayed.

## Important Limits

A TIN is not proof of legal identity by itself.

It is a payment identity. Verification status comes from registered verification platforms and attestations.

## Technical Details

| Item | Location |
| --- | --- |
| TINS program | `tins-registrar/program/` |
| TINS docs | `tins-registrar/README.md` |
| TINS SDK | `tins-sdk/` |
| Devnet program ID | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |
