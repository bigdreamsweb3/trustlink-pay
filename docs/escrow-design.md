# TrustLink Pay Escrow Design

## Program Accounts

### `EscrowV3`

File:
[backend/programs/trustlink-escrow/src/v3_state.rs](/C:/Users/codepara/Desktop/trust-link/backend/programs/trustlink-escrow/src/v3_state.rs)

Fields:

- `sender`
- `master_registry_pubkey`
- `recipient_child_hash`
- `amount`
- `token_mint`
- `nonce`
- `expiry_ts`
- `auto_claim_dest_hash`
- `derivation_proof_sig`
- `state`
- `bump`
- `vault_authority_bump`

Seeds:

- `"escrow_v3"`
- `recipient_child_hash`
- `nonce.to_le_bytes()`
- `token_mint`

### `ConsumedNonceV3`

Fields:

- `master_registry_pubkey`
- `escrow`
- `nonce`
- `consumed_at`
- `bump`

Seeds:

- `"escrow_v3_nonce"`
- `master_registry_pubkey`
- `nonce.to_le_bytes()`

Purpose:
Create-once replay protection.

## Instructions

### `create_escrow_v3`

Inputs:

- recipient child hash
- master registry public key
- nonce
- expiry
- auto-claim destination hash
- derivation proof signature
- amount

Behavior:

- initializes escrow PDA
- initializes per-payment token vault
- transfers sender SPL tokens into vault
- stores immutable release metadata

### `claim_v3`

Inputs:

- child public key
- destination public key
- derivation proof signature
- child signature

Verification:

- escrow must be `Held`
- current time must be `<= expiry_ts`
- `hash(child_pubkey)` must equal `recipient_child_hash`
- derivation proof must have been verified by Ed25519 pre-instruction using `master_registry_pubkey`
- child signature must have been verified by Ed25519 pre-instruction using `child_pubkey`
- destination must match the signed message
- nonce PDA must not already exist

Effects:

- creates `ConsumedNonceV3`
- transfers vault balance to destination token account
- closes escrow vault
- marks escrow `Claimed`
- closes escrow account

### `auto_claim_v3`

Inputs:

- child public key
- destination public key
- derivation proof signature

Verification:

- escrow must be `Held`
- current time must be `>= expiry_ts`
- `hash(child_pubkey)` must equal `recipient_child_hash`
- destination hash must equal `auto_claim_dest_hash`
- derivation proof must match the master registry key and escrow context
- nonce PDA must not already exist

Effects:

- creates `ConsumedNonceV3`
- transfers vault balance to the approved auto-claim destination
- closes vault and escrow

## Signature Binding

### Derivation proof message

Domain:

- `TLP_DERIVE_V1`

Message binds:

- `child_pubkey`
- `escrow_pubkey`
- `nonce`
- `expiry_ts`
- destination

Why:
This closes the “fabricated child relationship” and “reroute after proof reuse” attack paths.

### Claim message

Domain:

- `TLP_CLAIM_V1`

Message binds:

- `escrow_pubkey`
- `nonce`
- `expiry_ts`
- destination

Why:
This ensures the child key is authorizing this escrow and this destination, not a generic claim.

## Replay Defense

Replay protection is on-chain, not just off-chain.

The first successful claim creates `ConsumedNonceV3`.
Any second attempt with the same `(master_registry_pubkey, nonce)` fails because the PDA already exists.

## Front-Run Defense

Manual claims:

- signature includes destination
- program checks the exact message verified by the Ed25519 pre-instruction

Auto-claims:

- destination hash must equal the stored `auto_claim_dest_hash`

This means an attacker cannot intercept a valid proof and redirect payout to a different wallet.

## Privacy Model

The chain does not need a reusable phone-number hash as the escrow recipient identity.

Instead it uses:

- an off-chain master registry public key
- an ephemeral child public key
- the hash of that child public key

This reduces linkability between payments.

## Residual Risks

- master key compromise is still a high-impact event
- poor wallet UX around Ed25519 proof construction can cause implementation mistakes
- crank infrastructure must be reliable, even if it is not custodial

## Current Code Paths

- Program entrypoints:
  [backend/programs/trustlink-escrow/src/lib.rs](/C:/Users/codepara/Desktop/trust-link/backend/programs/trustlink-escrow/src/lib.rs)
- Hardened verification logic:
  [backend/programs/trustlink-escrow/src/v3.rs](/C:/Users/codepara/Desktop/trust-link/backend/programs/trustlink-escrow/src/v3.rs)
- Backend transaction builders:
  [backend/app/blockchain/trustlink-pay-v3.ts](/C:/Users/codepara/Desktop/trust-link/backend/app/blockchain/trustlink-pay-v3.ts)
