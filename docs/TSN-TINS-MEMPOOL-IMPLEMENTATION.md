# TSN-Mediated TINS Operations

This document explains how TIN creation and TIN updates move through the TSN mempool before the TINS registry is changed.

The short version: users do not submit TINS registry transactions directly. They sign an owner intent in the frontend. That signed intent goes straight to the TSN mempool backend. Crankers verify it, record the fee commitment, and relay the registry transaction.

## What This Is

TINS is the identity registry. It stores a user's Transfer Identity Number, public-safe profile fields, encrypted identity data, and PRU commitment hashes.

TSN is now the control plane for TINS mutations. A TIN creation or update first becomes a TSN mempool operation. Only after verification and fee commitment does a Cranker submit the TINS registry mutation on-chain.

## Why It Exists

Direct TINS creation had three problems:

- the user had to pay registry transaction costs directly
- applications could bypass the protocol's verification and fee rules
- identity updates were harder to audit as protocol work

The new flow keeps owner authority while moving operational work into the Cranker network.

The Cranker never becomes the TIN owner. The owner remains the authority because the TINS program verifies the owner's Ed25519 signature over the intent hash before creating or updating the record.

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
4. The TSN mempool backend assembles the encrypted phone payload, private metadata commitment, and PRU configuration commitment.
5. Cranker A pulls `/tin-operations/verification-work`.
6. Cranker A verifies the owner signature, nonce, expiry, privacy level, and commitment hashes.
7. The operation becomes `verified`.
8. Cranker B pulls `/tin-operations/fee-work`.
9. Cranker B records the deterministic fee commitment.
10. The operation becomes `fee_committed`.
11. Cranker B pulls `/tin-operations/registry-work`.
12. Cranker B submits `tin_creation_registry` with the owner's Ed25519 signature instruction.
13. The operation becomes `submitted_onchain`, then `finalized` after confirmation.

## How Updates Work

Updates follow the same pipeline.

The main difference is that the verifier must confirm the owner still matches the stored TIN owner before allowing the update to continue.

The update payload can change:

- display name
- encrypted phone payload
- privacy level
- encrypted metadata hash
- PRU configuration hash

The mempool stores only commitments and encrypted payloads. It does not expose raw phone numbers, PRU derivation material, or TIN Master Seed material to the frontend.

## Fee Commitment

Canonical fees:

- TIN creation: `0.05 USDC`
- TIN update: `0.01 USDC`

Collection follows the same supported-token or SOL handling path already used for payment-intent fees. The difference is only the split destination, not the collection boundary.

Split:

| Recipient | Share |
| --- | ---: |
| Verifier Cranker | 30% |
| Submitter Cranker | 40% |
| Team | 10% |
| Reserve pool | 20% |

The split is calculated in base units. Any rounding remainder stays in the reserve pool bucket. The fee commitment hash is deterministic so the same intent can be replayed and checked later.

Current implementation note: the split configuration is stored in TSN program state using the same Mother Escrow configuration pattern used by other TSN fee settings. The mempool reads that configuration and records the deterministic fee split plus the optional fee transaction hash.

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
- invalid privacy level
- malformed 32-byte metadata hash
- malformed 32-byte PRU hash
- missing owner signature
- mismatched owner intent hash
- creation conflicts in the mempool registry shadow
- update owner mismatch in the mempool registry shadow
- registry submission before verification
- registry submission before fee commitment

## Explorer UI

The mempool explorer shows a masked TINS queue.

It can show:

- intent type
- TIN
- masked owner pubkey
- privacy level
- status
- verifier cranker
- submitter cranker
- fee amount and split
- PRU commitment hash
- on-chain transaction references

It must not show:

- decrypted social identity data
- raw phone numbers
- encrypted phone payload contents
- owner signatures
- full PRU arrays
- private derivation material

## Important Limitation

Current on-chain TINS creation still assigns the next TIN from global state. The mempool accepts a `tin` field for scheduling and conflict checks, but the registry program is the final source of truth for the actual created TIN.

If the protocol requires user-selected or pre-reserved TINs, the on-chain `tin_creation_registry` instruction must be extended to validate a requested TIN or reservation record.

## Local Checks

Use focused checks first:

```bash
python -m py_compile tsn-mempool-backend/server.py
npm --prefix tsn-mempool-frontend run typecheck
npm --prefix tsn-sdk run build
npm --prefix tins-sdk run build
```

Then run program tests when the Solana toolchain is stable:

```bash
cargo test --manifest-path tins-registrar/program/Cargo.toml --lib
cargo test --manifest-path tsn/protocol/programs/trustlink-escrow/Cargo.toml --lib
```
