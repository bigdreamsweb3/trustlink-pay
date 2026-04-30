# TrustLink Pay Escrow Architecture

## One Sentence

TrustLink Pay is a noncustodial Solana payment dApp that routes stablecoin payments through per-payment escrow PDAs while using WhatsApp-linked identity and verified business confidence signals as the user-facing routing layer.

## Product Clarification

TrustLink Pay is not a WhatsApp-native wallet app.

It is:

- a Solana stablecoin escrow system
- a phone-first payment routing experience
- a business-confidence layer for safer recipient selection

WhatsApp is the identity proxy and notification channel.
The escrow program is the settlement engine.

## TrustLink v3 Flow

### 1. Recipient registry

Off-chain registry stores:

- `master_privacy_pubkey`
- `auto_claim_destination`
- registry metadata

The backend must never store the recipient master private key.

### 2. Child key derivation

For each payment or claim context, the recipient derives an ephemeral child key.

The master key signs a derivation proof that binds:

- `child_pubkey`
- `escrow_pubkey`
- `nonce`
- `expiry`
- destination

### 3. Sender creates escrow

The sender creates a dedicated escrow PDA using:

- `"escrow_v3"`
- `recipient_child_hash`
- `nonce`
- `token_mint`

The vault authority is another PDA derived from the same escrow tuple.

The escrow stores:

- sender
- master registry public key
- recipient child hash
- amount
- token mint
- nonce
- expiry
- auto-claim destination hash
- derivation proof signature
- state

### 4. Manual claim

Before expiry, the recipient claims by presenting:

- child public key
- child signature over escrow-bound claim message
- derivation proof signature from the master registry key
- destination

The program verifies both Ed25519 proofs through the instructions sysvar, checks the destination binding, consumes the nonce, releases funds, and closes the escrow.

### 5. Auto-claim

After expiry, a crank can submit auto-claim to the recipient’s pre-approved destination.

The crank is not a custodian.

It only submits a transaction that the program will reject unless:

- derivation proof is valid
- child public key hash matches the escrow
- destination hash matches the escrow
- nonce has not already been consumed

## Safety Invariants

### Per-payment isolation

Every escrow has its own PDA and vault.

### Noncustodial release

No operator key is sufficient to move user funds without valid user-linked proofs.

### Replay resistance

A consumed nonce PDA prevents a signature from being reused.

### Front-run resistance

Destination is part of the signed payload and also checked against the escrow’s stored destination hash.

### Identity privacy

The chain stores a child-key hash, not a reusable phone-hash identity anchor.

## Threat Review

### Stolen child key

Risk:
An attacker with only the child key tries to claim.

Mitigation:
They still need the valid derivation proof tied to escrow, nonce, expiry, and destination.

### Stolen master key

Risk:
A master key compromise is more serious because it can sign derivation proofs.

Mitigation:

- isolate by encouraging per-device protection
- keep master private key client-side only
- use child keys per payment to reduce exposure
- keep destination binding strict so a leaked proof cannot reroute to arbitrary wallets

### Replay

Risk:
A valid signature is replayed.

Mitigation:
Nonce PDA creation is single-use and enforced on-chain.

### Front-running

Risk:
An attacker copies a transaction and swaps the destination.

Mitigation:
Destination is included in the signed messages and checked on-chain.

## Backend Responsibilities

- build `create_escrow_v3`, `claim_v3`, and `auto_claim_v3` transactions
- expose registry-aware APIs
- never store master private keys
- log proof submissions and nonce usage
- run auto-claim crank logic without taking custody

## User Experience Layer

TrustLink Pay can still feel simple:

- sender chooses a phone-linked recipient
- sender sees business identity confidence if available
- recipient can auto-claim to a verified wallet
- advanced cryptography stays behind the scenes

That combination is the product advantage: familiar identity in front, hardened escrow underneath.
