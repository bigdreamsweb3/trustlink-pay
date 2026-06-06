# TINS Registrar Program

TINS Registrar is the Solana program that creates wallet-owned Transfer Identity Numbers for TrustLink Pay and future integrations.

A TIN is a 10-digit payment identity that can be shared instead of a wallet address.

---

## Devnet Program ID

```text
TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
```

The TSN settlement program is separate:

```text
TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
```

---

## What The Program Stores

TINS has two compatible account paths:

| Account | Purpose |
| --- | --- |
| `IdentityRegistry` | The TIN-derived registry PDA used by protocol integrations |
| `TinAccount` | Legacy wallet-derived account kept for compatibility |

The active protocol-grade path is `IdentityRegistry`, derived from the 10-digit TIN:

```text
["registry", tin_le_u64]
```

The legacy identity PDA is derived from:

```text
["identity", sha256(wallet_pubkey || "TINS_SALT_2026")]
```

---

## Encrypted Identity Graph

Each `IdentityRegistry` stores a public TIN name plus encrypted identity links.

| Field | Encryption model | Who can decrypt |
| --- | --- | --- |
| `social_identities` | AES-GCM key derived from the 10-digit TIN | Anyone with the TIN |
| `sensitive_fields` | AES-GCM key derived from TIN + explicit user signature | Only a user-authorized resolver |

Social identities are flexible records:

```text
identity_type = "whatsapp" | "x" | "email" | future platform string
label         = user-facing route label
metadata      = structured JSON string for UI and verification context
nonce         = AES-GCM nonce
ciphertext    = encrypted identity payload
verified_by   = optional registered verification platform public key
```

Sensitive fields use the same encrypted container but require a fresh user authorization signature. The first supported example is:

```text
field_type = "kyc_document_hash"
```

This lets the registry prove that sensitive data exists without making the data public to everyone who knows the TIN.

---

## Verification Platform Registry

The program now includes a global `PlatformRegistry` PDA:

```text
["platform-registry"]
```

The registry authority can:

- initialize the platform registry
- add verification platform public keys
- rotate platform keys by recording `rotated_from`
- deactivate old platform keys

When a user links a verified social identity:

1. the platform verifies the identity off-chain
2. the platform signs a proof message
3. the transaction includes an Ed25519 verification instruction
4. the TINS program checks that the signer exists and is active in `PlatformRegistry`
5. the encrypted identity is appended to the owner’s `IdentityRegistry`

Only the TIN owner can link identities. Platform signatures prove verification; they do not replace owner authorization.

---

## Protocol Role

TINS is the receive identity layer.

```text
10-digit TIN -> identity PDA -> settlement route
```

TrustLink Pay uses TINS as the main payment identity. Phone, WhatsApp, X, email, business, and future routes attach to a TIN as encrypted identity links.

---

## Build

```powershell
cd tins-registrar/program
cargo build-sbf
```

Or from the repository root:

```powershell
npm run tins:build
```

---

## Deployment

Deployment is an operator action. Use the real TINS deploy keypair whose public key is:

```text
TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
```

Do not deploy with a generated local `target/deploy` keypair unless its public key matches that program id.

Command shape:

```powershell
solana program deploy target/deploy/tins_program.so --url devnet --program-id <REAL_TINS_PROGRAM_KEYPAIR_JSON>
```

---

## Integration

TrustLink Pay and external apps should treat TINs as the primary receive identity.

Application-layer services may attach phone or social identity metadata, but those links should resolve to TINs instead of replacing TINs.

See `docs/TINS.md` and `docs/INTEGRATION.md`.
