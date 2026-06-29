# TINS

**Version: Stable PRU Architecture v1**

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
- an SHA-256 owner pubkey commitment
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

## Lookup Output

The `npm run tins:lookup <TIN>` command now prints three separate views:

- public on-chain fields
- encrypted fields stored in the registry
- the raw account bytes in hex and base64

This makes it easier to see which parts of a TIN are public, which parts are encrypted, and which fields do not exist in older legacy accounts.

## Final upgraded PRU Architecture for TINs

### Summary

Every TIN starts with **exactly 30 PRUs**. PRUs are **token-agnostic**: one PRU can receive any token supported by TSN. PRU derivation, TIN Master Seed generation, and encryption belong to the TSN mempool and Cranker layer. The frontend and SDK sign authorization intents; they do not derive PRUs or handle PRU configuration.

### Strict separation of concerns

| Layer | Stores | Mutation rule |
| --- | --- | --- |
| **TIN Registry** | TIN number, display name, identity PDA, SHA-256 owner pubkey commitment, encrypted TIN Master Seed blob, encrypted metadata hash, PRU configuration commitment | Created by `tin_creation_registry`; rarely updated by `tin_update`; never stores the raw owner wallet as an authority field, PRU keys, token balances, ATA state, or spend history. |
| **PRU Lifecycle State** | per-token receipt/spend/sweep state, ATA creation status, rent subsidy counter, balance state | Lives in TSN / derived mempool state and changes on receipt, spend, sweep, and lazy ATA activation. |

### Creation flow

1. The frontend collects only the user-facing fields and asks the owner wallet to sign a plain TIN owner-intent message.
2. The frontend posts that signed intent directly to the TSN mempool backend.
3. The TSN mempool backend assembles the encrypted TIN Master Seed payload, private metadata commitment, and 30-PRU commitment.
4. Cranker A verifies the owner signature, expiry, metadata shape, and that the PRU commitment is valid.
5. Cranker A submits Transaction 1: the fee commitment split.
6. Cranker B submits Transaction 2: `tin_creation_registry` with the owner Ed25519 verification instruction.
7. TINS creates the identity PDA from the owner pubkey and stores only static registry fields. The owner wallet is stored only as an SHA-256 pubkey commitment, never as a readable authority field.

TrustLink backend is not a bridge in this flow. It can cache identity state for the app, but it must never proxy TIN creation, upgrade, or update requests into TSN.

### Receiving, spending, and ATA creation

- Receiving resolves the finalized PRU route for the destination TIN and selects an active PRU deterministically for the incoming payment and token. The selected PRU receives the net amount after recipient fee deduction.
- Spending uses a randomly selected PRU signing key in the SDK, then records spend lifecycle state through TSN + Crankers. This breaks the pattern where the same wallet key is always active.
- Crankers create token ATAs lazily on first receipt for a PRU/token pair. TSN subsidizes the first few ATA rents per PRU as acquisition cost; after the subsidy window, a small activation fee can be deducted from the incoming amount.

### Implementation notes

The TINS program accepts Cranker-mediated `tin_creation_registry` after owner intent verification. TSN uses a fixed `DEFAULT_TIN_PRU_COUNT = 30`; every PRU is token-agnostic.

The important boundary is this:

- frontend signs owner intent
- TSN mempool backend assembles private payloads
- Crankers submit on-chain mutations
- TrustLink backend only handles app-local identity state and display

Python Cranker daemon integration follows the same two-transaction model: verify intent, submit fee commitment, then submit registry transaction. Do not log PRU seeds, raw PRU arrays, phone numbers, raw wallet balances, or owner private material.

### Usage examples

```text
Frontend -> sign owner intent
Frontend -> POST signed intent to TSN mempool
TSN mempool -> assemble encrypted TIN Master Seed + PRU commitment
Cranker -> verify + fee commit + submit TINS mutation
```

```bash
npm run tsn:cranker:start
```

### Security & privacy considerations

Hidden: PRU seeds, PRU private keys, raw PRU arrays, token-specific lifecycle state, phone numbers, balances, TIN Master Seed material, spend selection randomness, the raw owner wallet pubkey, and raw TIN numbers in public mempool views. Exposed on-chain: the TIN registry fields, display name, identity PDA, SHA-256 owner pubkey commitment, encrypted seed blob, encrypted metadata hash, and PRU configuration commitment. Crankers relay and verify; they never become custodians and cannot mutate ownership without the owner-signed intent. The wallet signs a message, not a Solana transaction, for TIN creation or upgrade authorization.

### Testing notes

Run:

```bash
npm --prefix tin-system/tins-sdk run build
npm --prefix tsn-protocol/tsn-sdk test
cargo test --manifest-path tin-system/tins-registrar/program/Cargo.toml --lib
```

## PRU SpendGuard and isolated TIN Master Seed (2026-06-26)

### Summary

TINS separates identity ownership from PRU spend authority. A TIN owner controls the TIN with an owner-signed intent, but PRU spend keys come from a random TIN Master Seed generated inside the TSN mempool and Cranker layer. The main wallet cannot derive, predict, or expose PRU keys.

### Implementation notes

- TINS program state includes `PruSpendGuard` per PRU: `tin`, `pru_index`, `spend_auth_hash`, `nonce_bitmask`, `active`, and `bump`.
- `spend_auth_hash = SHA256(tin + pru_index + main_wallet_pubkey + TRUSTLINK_PRU_SPEND_GUARD_V1)` binds that PRU to the real TIN owner.
- PDA seeds are `["pru_spend_guard", tin.to_le_bytes(), pru_index.to_le_bytes()]` so Crankers and SDK clients can find the guard deterministically without exposing PRU private keys.

### Usage examples

```ts
import { computePruSpendAuthHash } from "@trustlink/tsn-sdk/pru";

const spendAuthHash = computePruSpendAuthHash({
  tin: "1234567890",
  pruIndex: 4,
  mainWalletPubkey: ownerPubkey,
});
```

### Security & privacy considerations

The TIN Master Seed has zero mathematical relationship to wallet signatures. A malicious app can collect ordinary wallet signatures forever and still gains no path to the seed or PRU keys. The guard account records replay state and owner binding; it never stores a PRU private key.

### Testing notes

Use `npm --prefix tsn-protocol/tsn-sdk test` and confirm the PRU security tests reject cross-TIN spends and replayed nonces while preserving deterministic PRU guard hashing.
