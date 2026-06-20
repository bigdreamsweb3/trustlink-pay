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

## TSN + Cranker mediated TINS creation and updates

Version: TSN V1 Cranker-mediated TINS operations
Commit reference: current branch worktree

### Summary

TINS creation and TINS updates no longer use the old direct user-submitted path. The owner signs an intent, the intent enters the TSN Mempool runtime, one Cranker verifies it, and a Cranker submits the TINS transaction as a relayer. The owner remains the authority because the TINS program verifies the owner-signed intent hash through the Solana instructions sysvar before changing any TIN record.

### New creation flow versus old flow

Old flow, now disabled:

1. User wallet signed and submitted `CreateTin` directly to TINS.
2. User wallet paid network fees.
3. TINS inferred owner authority from the transaction payer.

New flow:

1. Owner signs a TIN creation intent hash.
2. The signed intent is sent to the TSN Mempool runtime.
3. Cranker A verifies owner signature, expiry, metadata shape, PRU commitment, and the 0.05 USDC creation-fee commitment split.
4. Cranker A submits `tin_creation_fee_commitment` in TSN.
5. Cranker B submits `tin_creation_registry` to TINS with the owner signature instruction and the owner as `owner_pubkey`.
6. TINS creates the TIN PDA derived from the owner, not from the Cranker.

Creation fee split: 30% verifier, 40% submitter, 20% treasury, 10% bonus pool.

### New update flow

1. Owner signs an update intent hash containing new encrypted metadata, nonce, expiry, privacy level, and PRU configuration commitment.
2. The intent enters the TSN Mempool runtime.
3. Cranker A verifies that the signer is the current TIN owner by reading TINS, checks data validity, and verifies the optional 0.01 USDC update fee commitment.
4. Cranker B submits `tin_update` to TINS.
5. TINS verifies the owner-signed intent hash on-chain before modifying the record.

### Implementation notes

TypeScript uses `createTinOwnerIntentHash`, `createOwnerIntentSignatureInstruction`, `serializeTinCreationRegistryParams`, and `serializeTinUpdateParams` from `tins-sdk`. The deprecated `createTin` SDK path now throws so applications cannot accidentally bypass TSN.

Python Cranker daemon implementations should mirror the same stages:

```bash
tsn-cranker tins verify-create-intent --intent <INTENT_ID>
tsn-cranker tins commit-create-fee --intent <INTENT_ID>
tsn-cranker tins submit-create-registry --intent <INTENT_ID>
tsn-cranker tins verify-update-intent --intent <INTENT_ID>
tsn-cranker tins submit-update --intent <INTENT_ID>
```

### Security & privacy considerations

Hidden: raw phone numbers, PRU arrays, PRU derivation seeds, private keys, and owner operational network details. Exposed: owner signature over an intent hash, privacy tier, and commitment hashes needed for replay verification. Crankers are relayers only; they cannot become TIN owners because TINS derives the identity PDA from the owner pubkey and verifies the owner signature before creation or update.

### Testing notes

Run:

```bash
npm --prefix tins-sdk run build
cargo test --manifest-path tins-registrar/program/Cargo.toml --lib
```
