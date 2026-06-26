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

## Lookup Output

The `npm run tins:lookup <TIN>` command now prints three separate views:

- public on-chain fields
- encrypted fields stored in the registry
- the raw account bytes in hex and base64

This makes it easier to see which parts of a TIN are public, which parts are encrypted, and which fields do not exist in older legacy accounts.

## Final upgraded PRU Architecture for TINs

### Summary

Every TIN now starts with **30 PRUs by default**. PRUs are **token-agnostic**: one client-derived PRU set serves SOL, USDC, and every future token supported by TSN. We separate identity from execution so public registry data remains static while settlement state changes inside TSN.

### Strict separation of concerns

| Layer | Stores | Mutation rule |
| --- | --- | --- |
| **TIN Registry** | owner pubkey, display name, encrypted phone blob, privacy level `3`, encrypted metadata hash, PRU configuration commitment | Created by `tin_creation_registry`; rarely updated by `tin_update`; never stores PRU keys, token balances, ATA state, or spend history. |
| **PRU Lifecycle State** | per-token receipt/spend/sweep state, ATA creation status, rent subsidy counter, balance state | Lives in TSN / derived mempool state and changes on receipt, spend, sweep, and lazy ATA activation. |

### New creation flow versus old flow

Old direct path, removed/disabled:

1. User wallet submitted `CreateTin` directly to TINS.
2. User wallet paid fees and acted as transaction payer.
3. TINS inferred authority from the payer.

New Cranker-mediated path:

1. SDK derives 30 token-agnostic PRUs client-side and computes only the PRU configuration commitment.
2. Owner signs a TIN Creation Intent covering owner pubkey, encrypted metadata hashes, PRU commitment, nonce, and expiry.
3. Cranker A verifies the owner signature, expiry, metadata shape, and that the PRU commitment is a 30-PRU commitment.
4. Cranker A submits Transaction 1: the fee commitment split.
5. Cranker B submits Transaction 2: `tin_creation_registry` with the owner Ed25519 verification instruction.
6. TINS creates the identity PDA from the owner pubkey and stores only static registry fields.

### Receiving, spending, and ATA creation

- Receiving uses deterministic allocation over the 30 PRUs for the incoming token. The allocation can be replayed by Crankers without seeing derivation seeds.
- Spending uses a randomly selected PRU signing key in the SDK, then records spend lifecycle state through TSN + Crankers. This breaks the pattern where the same wallet key is always active.
- Crankers create token ATAs lazily on first receipt for a PRU/token pair. TSN subsidizes the first few ATA rents per PRU as acquisition cost; after the subsidy window, a small activation fee can be deducted from the incoming amount.

### Implementation notes

TypeScript uses `derivePruSet`, `computePruConfigurationHash`, `allocatePrusDeterministically`, `selectRandomPruForSpend`, `selectPrusForSpend`, and `planLazyAtaCreation` from `tsn-sdk`. TINS uses `DEFAULT_TIN_PRIVACY_LEVEL = 3` and `DEFAULT_TIN_PRU_COUNT = 30`; the deprecated `createTin` SDK path throws. The TINS program rejects the old `CreateTin` instruction and accepts only Cranker-mediated `tin_creation_registry` after owner intent verification.

Python Cranker daemon integration follows the same two-transaction model: verify intent, submit fee commitment, then submit registry transaction. Do not log PRU seeds, raw PRU arrays, phone numbers, raw wallet balances, or owner private material.

### Usage examples

```ts
import { derivePruSet, computePruConfigurationHash } from "@trustlink/tsn-sdk/pru";

const pruSet = derivePruSet({ masterSeed, tinId });
const pruConfigurationHash = computePruConfigurationHash(pruSet);
// Submit only the commitment in the TIN Creation Intent. Keep derivation client-side.
```

```bash
npm run tsn:cranker:start
```

### Security & privacy considerations

Hidden: PRU seeds, PRU private keys, raw PRU arrays, token-specific lifecycle state, phone numbers, balances, and spend selection randomness. Exposed: the TIN, static owner authority, privacy level 3, and commitment hashes. Crankers relay and verify; they never become custodians and cannot mutate ownership without the owner-signed intent.

### Testing notes

Run:

```bash
npm --prefix tins-sdk run build
npm --prefix tsn-sdk test
cargo test --manifest-path tins-registrar/program/Cargo.toml --lib
```

## PRU SpendGuard and isolated TIN Master Seed (2026-06-26)

### Summary

TINS now separates identity ownership from PRU spend authority. A TIN owner still controls the TIN with the main wallet, but PRU spend keys come from a random TIN Master Seed generated by the SDK CSPRNG. The main wallet can encrypt that seed for recovery and storage; it cannot derive, predict, or expose PRU keys.

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

The TIN Master Seed has zero mathematical relationship to wallet signatures. A malicious dApp can collect ordinary wallet signatures forever and still gains no path to the seed or PRU keys. The guard account records replay state and owner binding; it never stores a PRU private key.

### Testing notes

Use `npm --prefix tsn-sdk test` and confirm the PRU security tests reject cross-TIN spends and replayed nonces while preserving deterministic PRU guard hashing.
