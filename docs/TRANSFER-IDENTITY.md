# Transfer Identity Protocol

**Version: Stable ZK-PRU Architecture v1**

The **Transfer Identity Protocol** is the identity layer used by TrustLink Pay. It supports the [blockchain payment solution](../README.md) by giving users a payment identity that does not require sharing a wallet address.

It gives a user a Transfer Identity profile. That profile can contain a 10-digit **TIN** (**Transfer Identity Number**), a public display name, verified identity fields, encrypted social identity links, and ZK-PRU protected receiving commitments.

## What Is This?

A TIN is the 10-digit number inside a Transfer Identity. It can be shared instead of a wallet address.

Example:

```text
1000000008
```

The Transfer Identity is the public payment identity. The TIN is the numeric handle people can type, scan, or share. Wallets, social accounts, legal-name attestations, and verification records can be linked behind the Transfer Identity.

Transfer Identities are designed around a simple privacy principle: people should be discoverable by the identities they choose to share, not by the identities others search for.

Identity fields such as social profiles and legal names can be stored in encrypted form within the registry. Once a sender has a recipient's 10-digit TIN, they can resolve and verify the identity information associated with that TIN. However, someone browsing the public registry cannot easily work backwards from a name, social handle, or public profile to discover the recipient's TIN.

This prevents a public payment identity from becoming a public directory. The TIN becomes one key for resolving confidence, rather than personal information becoming the key that exposes the TIN.


## Why It Exists

Wallet addresses are not friendly for everyday payments.

They are long, easy to mistype, and once shared they can expose a lot of activity. A Transfer Identity gives users a simpler payment identity that can move across apps and wallets.

## How It Works

The Transfer Identity registry stores identity records on Solana.

The record can include:

- the TIN number
- an SHA-256 owner pubkey commitment
- a public display name if one exists
- verification status
- encrypted social identities
- sensitive fields that require explicit user authorization to decrypt
- platform verification proof references

The identity display distinguishes between:

- a verified legal or registry name
- and social profile name

When a TIN has no verified name, the interface labels that status explicitly.

## On-Chain Account Privacy Model

The TIN account stores only public identity fields, encrypted recovery material, and one-way hash commitments. It never stores the owner's wallet address or ZK-PRU receiving addresses in readable form. The full field-level privacy model is documented in [TIN Account Data Structure](./TIN-ACCOUNT-DATA-STRUCTURE.md).

## Social Identity Encryption

Social identities are optional links such as WhatsApp, email, or X.

These records are encrypted before storage. The TIN can be used as part of the public decryption path for social identity records that are intended to be resolvable by someone who knows the TIN.

Sensitive records use a stronger rule. They require the TIN plus a fresh user signature before they can be decrypted.

## Verification Platforms

Verification platforms are trusted services that can sign identity proofs.

The Transfer Identity program supports a platform registry so the protocol can check whether a proof came from an authorized platform key. Platforms can rotate keys over time.

### Solana Attestation Service

Transfer Identity supports optional identity assurance while keeping every TIN payment-capable without a credential.

The Solana Attestation Service (SAS) is the designated credential framework for trusted legal-name, business-name, and personhood evidence. This assurance works like bank account-name validation: the credential confirms identity context while the TIN remains the public payment identifier.

SAS credentials remain outside TSN settlement. The TIN identifies the payment destination, while the credential provides evidence about the identity associated with that TIN.

## Example Flow

1. A user creates a TIN.
2. The user links a wallet.
3. The user may link WhatsApp or another social identity.
4. A verification platform signs proof that the identity link is valid.
5. The registry stores the encrypted identity link and proof reference.
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
| Transfer Identity program | `tin-registrar/program/` |
| Transfer Identity docs | `tin-registrar/README.md` |
| Transfer Identity SDK | `tip-sdk/` |
| Devnet program ID | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |

## Lookup Output

The `npm run tin:lookup <TIN>` command now prints three separate views:

- public on-chain fields
- encrypted fields stored in the registry
- the raw account bytes in hex and base64

This makes it easier to see which parts of a TIN are public, which parts are encrypted, and which fields do not exist in older legacy accounts.

## Final Upgraded ZK-PRU Architecture

### Summary

Every Transfer Identity starts with **exactly 30 ZK-PRU handles**. ZK-PRU handles are **token-agnostic**: one handle can receive any token supported by TSN. ZK-PRU derivation, TIN Master Seed generation, and encryption belong to the TSN mempool and Cranker layer. The frontend and SDK sign authorization intents; they do not derive ZK-PRU handles or handle ZK-PRU configuration.

### Strict separation of concerns

| Layer | Stores | Mutation rule |
| --- | --- | --- |
| **Transfer Identity Registry** | TIN number, display name, identity PDA, SHA-256 owner pubkey commitment, encrypted TIN Master Seed blob, encrypted metadata hash, ZK-PRU configuration commitment | Created by `tin_creation_registry`; rarely updated by `tin_update`; never stores the raw owner wallet as an authority field, ZK-PRU keys, token balances, ATA state, or spend history. |
| **ZK-PRU Lifecycle State** | per-token receipt/spend/sweep state, ATA creation status, rent subsidy counter, balance state | Lives in TSN / derived mempool state and changes on receipt, spend, sweep, and lazy ATA activation. |

### Creation flow

1. The frontend collects only the user-facing fields and asks the owner wallet to sign a plain TIN owner-intent message.
2. The frontend posts that signed intent directly to the TSN mempool backend.
3. The TSN mempool backend assembles the encrypted TIN Master Seed payload, private metadata commitment, and 30-ZK-PRU commitment.
4. Cranker A verifies the owner signature, expiry, metadata shape, and that the ZK-PRU commitment is valid.
5. Cranker A submits Transaction 1: the fee commitment split.
6. Cranker B submits Transaction 2: `tin_creation_registry` with the owner Ed25519 verification instruction.
7. The Transfer Identity program creates the identity PDA from the owner pubkey and stores only static registry fields. The owner wallet is stored only as an SHA-256 pubkey commitment, never as a readable authority field.

TrustLink backend is not a bridge in this flow. It can cache identity state for the app, but it must never proxy TIN creation, upgrade, or update requests into TSN.

### Receiving and ATA creation

- Receiving resolves the finalized ZK-PRU route for the destination TIN and selects an active ZK-PRU handle deterministically for the incoming payment and token. The selected handle receives the net amount after recipient fee deduction.
- Crankers create token ATAs lazily on first receipt for a ZK-PRU/token pair. TSN subsidizes the first few ATA rents per handle as acquisition cost; after the subsidy window, a small activation fee can be deducted from the incoming amount.

### TIN balance

The dashboard shows a unified TIN balance by reading the finalized ZK-PRU public route from the TSN mempool with the owner's hash commitment, then querying supported token accounts for all 30 ZK-PRU public addresses through the RPC gateway. The frontend receives public ZK-PRU addresses only. It does not receive ZK-PRU private keys, the TIN Master Seed, encrypted seed material, or ZK-PRU derivation inputs.

The displayed TIN balance is the sum of all non-zero supported token balances across the active ZK-PRU handles linked to the authenticated TIN. This balance is shown together with the main wallet balance so the user sees one spendable payment balance while the routing still settles into ZK-PRU handles.

### TIN balance spend planning

The send screen evaluates a TIN balance spend plan before the user authorizes a payment. The planner uses the authenticated ZK-PRU route session to read supported token balances across the user's ZK-PRU handles, then compares that amount with the connected wallet balance.

Funding priority is:

1. TIN balance from ZK-PRU handles.
2. Connected main wallet top-up.
3. Stop if the combined balance is not enough.

The plan shown to the user separates the amount coming from TIN balance and the amount coming from the connected wallet. A ZK-PRU-only plan gives the strongest privacy. A wallet-only plan is the least private path and is used when no spendable TIN balance is available for the selected token.

For ZK-PRU-only payments, the frontend sends the signed payment authorization and selected public ZK-PRU indexes to the TSN mempool. The mempool verifies that the TIN route is finalized, decrypts the stored TIN Master Seed inside the TSN layer, derives the selected ZK-PRU signing keys, and releases a worker-only ZK-PRU spend permit to the assigned Cranker. The Cranker executes the on-chain ZK-PRU spend instruction, moves the payment amount into the private escrow, routes the sender fee to the TSN treasury, and then the normal private payout path pays the recipient ZK-PRU handle.

The frontend never receives ZK-PRU private keys, the TIN Master Seed, encrypted seed material, or ZK-PRU derivation inputs. It only sees public ZK-PRU addresses after authenticated route proof, public balances, and the selected ZK-PRU indexes needed for mempool authorization. Mixed ZK-PRU plus main-wallet funding is supported only when the user explicitly authorizes the visible wallet top-up portion; the ZK-PRU-funded portion still goes through TSN ZK-PRU-spend execution.

## ZK-PRU Route Authentication and Delegated Access

ZK-PRU public addresses are private route metadata. They are not exposed through an unauthenticated TIN lookup because revealing them would make it easier to watch a recipient's payment routes. A caller must prove that it is the TIN owner or a platform that the owner explicitly trusted.

### Owner route sessions

The frontend loads a TIN balance through the TSN SDK. The SDK builds a plain UTF-8 ownership proof message with the TIN, purpose `zk_pru_route_lookup`, owner public key, nonce, and timestamp. The wallet signs that message with `signMessage`; it never signs a Solana transaction and no fee is charged.

The signed proof is sent to the TSN mempool at `POST /tin-routes/session`. The mempool verifies the on-chain owner pubkey commitment, the Ed25519 signature, a one-use nonce, and a fresh timestamp. If the proof is valid, the mempool returns a 24-hour route session token. The SDK stores this token in memory only, scoped to the TIN, connected owner wallet, and mempool endpoint. It is not written to `localStorage` or `sessionStorage`. Concurrent balance loads for the same TIN and connected owner share one authorization request, so the dashboard and send screen cannot produce duplicate signature prompts.

The SDK then calls `GET /tin-routes/:tin/prus` with the session token. The endpoint returns only public ZK-PRU addresses and route state. It does not return ZK-PRU private keys, the TIN Master Seed, encrypted seed material, or ZK-PRU derivation inputs.

### Delegated platform access

A trusted platform can register a read key with `POST /platform/register-read-key`. Registration only identifies the platform read key and contact. It does not grant access to any user TIN.

The TIN owner grants a platform access by signing a plain delegation message with purpose `delegate_read_access`. The signed grant is sent to `POST /tin-routes/delegate` with the platform read key and expiry. The default SDK grant duration is 30 days. The owner can revoke access by signing a `revoke_read_access` message and sending it to `DELETE /tin-routes/delegate`.

After a grant is active, the platform can call `GET /tin-routes/:tin/prus` using its platform key and a signature proving control of that key. If the grant is active and unexpired, the mempool returns the public ZK-PRU address list. If the grant is expired, revoked, or missing, the request returns `403`.

Delegated read access is read-only. It can reveal public ZK-PRU addresses for balance reads, but it cannot authorize spending, sweeping, TIN updates, ZK-PRU lifecycle mutation, or any on-chain transaction.

### Protocol enforcement

The Transfer Identity program accepts Cranker-mediated `tin_creation_registry` after owner intent verification. TSN uses a fixed `DEFAULT_TIN_ZK_PRU_COUNT = 30`; every ZK-PRU handle is token-agnostic.

The important boundary is this:

- frontend signs owner intent
- TSN mempool backend assembles private payloads
- Crankers submit on-chain mutations
- TrustLink backend only handles app-local identity state and display

Python Cranker daemon integration follows the same two-transaction model: verify intent, submit fee commitment, then submit registry transaction. Do not log ZK-PRU seeds, raw ZK-PRU arrays, phone numbers, raw wallet balances, or owner private material.

### Usage examples

```text
Frontend -> sign owner intent
Frontend -> POST signed intent to TSN mempool
TSN mempool -> assemble encrypted TIN Master Seed + ZK-PRU commitment
Cranker -> verify + fee commit + submit Transfer Identity mutation
```

```bash
npm run tsn:cranker:start
```

### Security & privacy considerations

Hidden from public views: ZK-PRU seeds, ZK-PRU private keys, token-specific lifecycle state, phone numbers, balances, TIN Master Seed material, spend selection randomness, the raw owner wallet pubkey, and raw TIN numbers in public mempool views. Authenticated owners can request their finalized public ZK-PRU address list for balance reads. Exposed on-chain: the Transfer Identity registry fields, display name, identity PDA, SHA-256 owner pubkey commitment, encrypted seed blob, encrypted metadata hash, and ZK-PRU configuration commitment. Crankers relay and verify; they never become custodians and cannot mutate ownership without the owner-signed intent. The wallet signs a message, not a Solana transaction, for TIN creation or upgrade authorization.

### Verification commands

Run:

```bash
npm --prefix transfer-identity-protocol/tip-sdk run build
npm --prefix tsn-protocol/tsn-sdk test
cargo test --manifest-path transfer-identity-protocol/tin-registrar/program/Cargo.toml --lib
```

## ZK-PRU SpendGuard and isolated TIN Master Seed (2026-06-26)

### Summary

The Transfer Identity program separates identity ownership from ZK-PRU spend authority. A TIN owner controls the TIN with an owner-signed intent, but ZK-PRU spend keys come from a random TIN Master Seed generated inside the TSN mempool and Cranker layer. The main wallet cannot derive, predict, or expose ZK-PRU keys.

### Protocol enforcement

- Transfer Identity program state includes `PruSpendGuard` per ZK-PRU handle: `tin`, `pru_index`, `spend_auth_hash`, `nonce_bitmask`, `active`, and `bump`.
- `spend_auth_hash = SHA256(tin + pru_index + main_wallet_pubkey + TRUSTLINK_PRU_SPEND_GUARD_V1)` binds that ZK-PRU handle to the real TIN owner.
- PDA seeds are `["pru_spend_guard", tin.to_le_bytes(), pru_index.to_le_bytes()]` so Crankers and SDK clients can find the guard deterministically without exposing ZK-PRU private keys.

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

The TIN Master Seed has zero mathematical relationship to wallet signatures. A malicious app can collect ordinary wallet signatures forever and still gains no path to the seed or ZK-PRU keys. The guard account records replay state and owner binding; it never stores a ZK-PRU private key.

### Verification commands

Use `npm --prefix tsn-protocol/tsn-sdk test` and confirm the ZK-PRU security tests reject cross-TIN spends and replayed nonces while preserving deterministic ZK-PRU guard hashing.
