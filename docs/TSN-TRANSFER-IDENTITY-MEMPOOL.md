# TSN-Mediated Transfer Identity Operations

This document explains how Transfer Identity creation and updates move through the TSN mempool before the registry is changed.

The short version: users do not submit registry transactions directly. They sign an owner intent in the frontend. That signed intent goes straight to the TSN mempool backend. Crankers verify it, record the fee commitment, and relay the registry transaction.

## What This Is

The Transfer Identity registry stores a user's TIN, public-safe profile fields, encrypted identity data, and PRU commitment hashes.

TSN is the control plane for Transfer Identity mutations. A TIN creation or update first becomes a TSN mempool operation. Only after verification and fee commitment does a Cranker submit the registry mutation on-chain.

## Why It Exists

The flow keeps owner control while moving operational work into the Cranker network.

The Cranker never becomes the TIN owner. Ownership is proven by the owner's Ed25519 signature over the intent hash and by matching the SHA-256 commitment stored in the Transfer Identity account. The raw owner wallet pubkey is not stored as a readable account authority.

TrustLink backend is not part of this path. It can store app state and display identity data, but it must never proxy or bridge TIN creation, upgrade, or update operations into TSN.

## Status Pipeline

TIN operations use these states:

```text
pending_verification
verifier_assigned
verified
fee_pending
fee_committed
submitter_assigned
submitted_onchain
finalized
rejected
expired
failed
```

The current daemon uses the compact path:

```text
pending_verification -> verified -> fee_committed -> submitted_onchain -> finalized
```

The additional assignment states are reserved for stricter multi-operator scheduling.

## How Creation Works

1. The frontend collects the public form fields the user wants to submit.
2. The owner wallet signs a plain owner-intent message buffer for the TIN operation. The frontend does not ask the wallet to sign a Solana transaction here.
3. The frontend posts the signed intent directly to `POST /tin-operations` on the TSN mempool backend.
4. The TSN mempool backend assembles the encrypted TIN Master Seed payload, private metadata commitment, and fixed 30-PRU configuration commitment.
5. Cranker A pulls `/tin-operations/verification-work`.
6. Cranker A verifies the owner signature, nonce, expiry, and commitment hashes.
7. The operation becomes `verified`.
8. Cranker A records the deterministic fee commitment.
9. The operation becomes `fee_committed`.
10. Cranker B pulls `/tin-operations/registry-work`.
11. Cranker B submits `tin_creation_registry` with the owner's Ed25519 signature instruction.
12. The operation becomes `submitted_onchain`, then `finalized` after confirmation.

## How Updates Work

Updates follow the same pipeline.

The main difference is that the verifier must confirm the owner intent resolves to the deterministic identity PDA for the TIN, and that the owner pubkey from the signed intent hashes to the account's stored owner commitment, before allowing the update to continue.

The update payload can change:

- display name
- encrypted TIN Master Seed payload
- encrypted metadata hash
- PRU configuration hash

The mempool stores only commitments and encrypted payloads. It does not expose raw phone numbers, PRU derivation material, or TIN Master Seed material to the frontend.

When a TIN creation or update finalizes, the mempool marks the matching PRU route as finalized. Payment settlement uses only finalized PRU routes. If a route is not finalized, the private payout permit is not issued.

## Fee Commitment

Canonical fees:

- TIN creation: `0.05 USDC`
- TIN update: `0.01 USDC`

Cranker A funds the TIN operation fee from its Cranker token account. The owner signs only the off-chain owner intent and never signs a Solana transaction for TIN creation or update.

Split:

| Recipient | Share |
| --- | ---: |
| Cranker A | 30% |
| Cranker B | 40% |
| Protocol Treasury | 10% |
| Reserve Pool | 20% |

The split is calculated in base units. Any rounding remainder stays in the reserve pool bucket. The fee commitment hash is deterministic so the same intent can be replayed and checked later.

The split configuration is stored in TSN program state using the same Mother Escrow configuration pattern used by other TSN fee settings. The mempool reads that configuration and records the deterministic fee split plus the fee transaction hash.

## Cranker Separation

There are two roles:

- verifier cranker
- submitter cranker

The backend prefers different crankers. If only one Cranker is online, set:

```bash
TSN_ALLOW_SINGLE_CRANKER_TINS=1
```

Without that flag, the same operator cannot verify and submit the same TIN operation.

## Backend Routes

Public:

```text
POST /tin-operations
GET  /tin-operations
GET  /tin-operations/:intentId
```

Worker protected:

```text
GET  /tin-operations/verification-work
GET  /tin-operations/fee-work
GET  /tin-operations/registry-work
POST /tin-operations/:intentId/verified
POST /tin-operations/:intentId/fee-committed
POST /tin-operations/:intentId/submitted
POST /tin-operations/:intentId/finalized
POST /tin-operations/:intentId/failed
POST /tin-operations/:intentId/rejected
```

The backend validates:

- expired intents
- reused nonce per owner
- malformed 32-byte metadata hash
- malformed 32-byte PRU hash
- missing owner signature
- mismatched owner intent hash
- creation conflicts in the mempool registry shadow
- update owner mismatch after checking the mempool registry shadow and, for legacy TINs, verified on-chain Transfer Identity state
- registry submission before verification
- registry submission before fee commitment

For `tin_update`, the Transfer Identity on-chain account is the source of truth. If the mempool registry shadow does not yet contain the TIN, the mempool derives the owner's identity PDA, reads that account from the Transfer Identity program, confirms the TIN number matches, checks the signed owner pubkey against the stored owner commitment, verifies the legacy settlement authority from Solana transaction history when importing older accounts, and imports the TIN into the shadow registry before accepting the update intent.

## Explorer UI

The mempool explorer shows a masked Transfer Identity queue.

It can show:

- intent type
- opaque TIN route id
- masked owner pubkey
- status
- verifier cranker
- submitter cranker
- fee amount and split
- PRU commitment hash
- on-chain transaction references

It must not show:

- raw TIN numbers
- decrypted social identity data
- raw phone numbers
- encrypted TIN Master Seed payload contents
- owner signatures
- full PRU arrays
- private derivation material

## Local Checks

Use focused checks first:

```bash
python -m py_compile tsn-mempool-backend/server.py
npm --prefix tsn-mempool-frontend run typecheck
npm --prefix tsn-protocol/tsn-sdk run build
npm --prefix tin-system/tins-sdk run build
```

Then run program tests when the Solana toolchain is stable:

```bash
cargo test --manifest-path tin-system/tins-registrar/program/Cargo.toml --lib
cargo test --manifest-path tsn-protocol/tsn/protocol/programs/trustlink-escrow/Cargo.toml --lib
```
