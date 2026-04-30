# Devnet Testing

## Goal

Validate the hardened TrustLink Pay v3 escrow path:

- create per-payment escrow PDA
- verify manual claim with derivation proof and child signature
- verify auto-claim after expiry
- verify nonce replay protection
- verify destination binding

## Program Surface

- `create_escrow_v3`
- `claim_v3`
- `auto_claim_v3`

## Backend Surface

- `POST /api/escrow/create`
- `POST /api/escrow/claim`
- `POST /api/escrow/auto-claim`

## Manual Happy Path

1. Generate or load:
   - sender wallet
   - recipient master registry keypair
   - recipient child keypair
   - recipient destination wallet
2. Compute:
   - `recipient_child_hash = sha256(child_pubkey)`
   - `auto_claim_dest_hash = sha256(destination_pubkey)`
3. Create derivation proof over:
   - `TLP_DERIVE_V1`
   - `child_pubkey`
   - `escrow_pubkey`
   - `nonce`
   - `expiry`
   - destination
4. Call `POST /api/escrow/create`.
5. Sign claim payload with child key over:
   - `TLP_CLAIM_V1`
   - `escrow_pubkey`
   - `nonce`
   - `expiry`
   - destination
6. Call `POST /api/escrow/claim`.
7. Prepend Ed25519 verification instructions for:
   - derivation proof
   - child claim proof
8. Submit transaction.
9. Confirm:
   - destination token account received funds
   - escrow account closed
   - nonce PDA exists

## Auto-Claim Happy Path

1. Create escrow with a short expiry.
2. Wait until `expiry_ts` passes.
3. Call `POST /api/escrow/auto-claim`.
4. Prepend Ed25519 verification instruction for derivation proof.
5. Submit transaction.
6. Confirm:
   - approved auto-claim destination received funds
   - escrow account closed
   - nonce PDA exists

## Negative Tests

### Replay test

- submit a valid claim
- submit the same claim again
- expect nonce PDA collision or replay failure

### Forged derivation proof

- provide wrong `derivation_proof_sig`
- expect `InvalidDerivationProof`

### Wrong child key

- provide child public key whose hash does not match escrow
- expect `InvalidChildPublicKey`

### Destination substitution

- sign proof for destination A
- try to claim to destination B
- expect destination mismatch or signature verification failure

### Premature auto-claim

- call `auto_claim_v3` before expiry
- expect `AutoClaimNotReady`

### Expired manual claim

- call `claim_v3` after expiry
- expect `ExpiredEscrow`

## Verification Checklist

- escrow PDA matches seeds
- vault authority PDA matches seeds
- vault token account mint matches escrow mint
- nonce PDA is unique per `(master_registry_pubkey, nonce)`
- proofs are bound to destination
- platform private key alone cannot release funds

## Current Verification Status

What is already in the repo:

- Anchor v3 escrow account and nonce account definitions
- Anchor v3 create/claim/auto-claim entrypoints
- Ed25519 instruction payload checking in the program
- backend `/api/escrow/*` builders

What still deserves deeper integration testing:

- end-to-end client assembly of Ed25519 pre-instructions
- real registry-side proof generation helpers
- devnet fixture scripts for child-key derivation and proof creation
