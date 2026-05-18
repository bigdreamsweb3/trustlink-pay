# TINS - Transfer Identity Number System

## Overview

TINS moves identity routing fully on-chain. Every user owns a permanent Transfer Identity Number (TIN) as a Solana PDA. No backend database required.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      TINS Program                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │ Global     │  │ Identity   │  │ Linked            │    │
│  │ Config    │  │ Registry   │  │ Identities       │    │
│  │ PDA       │  │ PDA       │  │ PDA              │    │
│  └─────────────┘  └─────────────┘  └─────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      TSN Program                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │ Mother    │  │ Cranker   │  │ Vault           │    │
│  │ Escrow   │  │ PDAs     │  │ PDAs            │    │
│  └─────────────┘  └─────────────┘  └─────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## TIN Structure

A TIN is a 10-digit identifier: `TIN-XXXX-XXXX`

| Field | Type | Description |
| --- | --- | --- |
| `owner` | Pubkey | Wallet that owns this TIN |
| `sequence` | u64 | Auto-incrementing TIN number |
| `created_at` | i64 | Unix timestamp |
| `identity_type` | u8 | 0 = wallet-only, 1 = phone-linked, 2 = social-linked |

## Accounts

### Global State
- Protocol fee recipient
- Fee settings
- TIN sequence counter
- Authority (admin)

### Identity Registry (PDA per TIN)
```rust
struct IdentityRecord {
    pub owner: Pubkey,           // Owner's wallet
    pub sequence: u64,           // TIN number
    pub created_at: i64,          // Creation timestamp
    pub identity_type: u8,       // How this identity was created
    pub identity_hash: [u8; 32],  // Hash of linked identity
    pub verified: bool,           // Has been verified
    pub version: u8,             // For upgrades
}
```

### Linked Identity (PDA for phone/social)
```rust
struct LinkedIdentity {
    pub identity_type: u8,       // 1 = phone, 2 = email, 3 = x handle
    pub identity_hash: [u8; 32], // Hash of actual value
    pub tin: u64,                 // Associated TIN
    pub added_at: i64,            // When linked
    pub verified: bool,           // Verification status
}
```

## Privacy Model

### What TIN Actually Stores

**NOT the main wallet address!** Instead:
- **Privacy public key** - derived from main wallet using BIP-44 path
- Each payment uses a **derived address** from this privacy key
- Main wallet never appears on-chain directly
- Only the main wallet's private key can sign transactions for derived addresses

```
Main Wallet (off-chain, secret)
    │
    ▼ derive (BIP-44)
Privacy Key (stored in TIN, public)
    │
    ▼ derive (per tx)
Derived Address 1, Derived Address 2, ... (public, no link to main)
```

### What Is Public (On-Chain)

| Data | Visible To | Risk |
| --- | --- | --- |
| TIN → privacy public key | Everyone | Low - for routing |
| Derived transaction addresses | Everyone | Low - unlinked |
| Linked identity hash | Everyone | Medium - can verify |
| Identity creation | Everyone | Low - expected |
| Identity type | Everyone | Low - metadata |

### What Is Private

| Data | Visibility |
| --- | --- |
| Actual phone number | Only the owner (stored off-chain) |
| Social handles | Only the owner |
| Transaction history | Not linked on-chain |
| Payment amounts | Via TSN (private) |

### Privacy Leakage Risks

1. **Identity enumeration**: Anyone can iterate all TINs
   - *Mitigation*: This is a feature, not a bug - allows verification
   - Only sees privacy key, not main wallet

2. **Linking analysis**: Same identity linked to multiple TINs
   - *Mitigation*: Use different hashes per linked identity
   - *Recommendation*: Don't link same phone to multiple TINs

3. **Payment tracing**: Even with privacy key, payments can be traced
   - *Mitigation*: Use TSN for private settlement (no on-chain link)

4. **Timing analysis**: When identity created/updated
   - *Mitigation*: None - this is public by design

5. **TSN payment linking**: Without TSN, payments reveal sender/recipient
   - *Mitigation*: Always use TSN for private settlement

## TSN Integration

TSN uses TINS for payment routing:

### Payment Flow with TINS

```
1. Sender enters recipient TIN (e.g., TIN-1234-5678)
2. TSN resolves TIN → owner wallet via TINS program
3. TSN creates payment intent with resolved recipient
4. TSN executes settlement via Cranker (no wallet link visible)
```

### TSN → TINS CPI

```rust
// Resolve TIN to wallet (called by TSN)
pub fn resolve_tin(tin: u64) -> Result<Pubkey> {
    let (registry_pda, _) = registry_pda(program_id, tin)?;
    let identity = load::<IdentityRecord>(&registry_pda)?;
    Ok(identity.owner)
}
```

## Link Identities to TIN

### Create TIN for Wallet

```rust
// Anyone can create a TIN for their wallet
invoke(
    &create_tin_ix,
    &[global_state, user_token_account, user],
)?;
```

### Link Phone to TIN

```rust
// Link phone after creating TIN
let phone_hash = sha256(phone_number.as_bytes());
invoke(
    &link_identity_ix,
    &[identity_registry, linked_identity, owner, system_program],
)?;
```

### Verify Linked Identity

Only the owner can verify their linked identity (e.g., via WhatsAppOTP).

## Cranker Privacy Improvements

### Problem
Crankers execute payments and could see:
- Sender wallet
- Recipient wallet
- Payment amount

### Solution

1. **Split Execution**:
   - Cranker interacts with TSN vault, not sender/recipient wallets
   - No on-chain link between sender → TSN → recipient

2. **Encrypted Memo** (optional):
   - Payment metadata encrypted with shared secret
   - Only sender/recipient can decrypt

3. **Encrypted Audit Trail**:
   - Cranker stores encrypted proof locally
   - Only protocol can verify, not read

4. **Zero-Knowledge Proof**:
   - Cranker proves valid execution without revealing amounts

## Security Considerations

### Attack Vectors

| Attack | Mitigation |
| --- | --- |
| Fake TIN creation | Requirelamport deposit (refundable) |
| Identity hijacking | Only owner can link/verify |
| Replay attacks | Use nonce in instructions |
| Program upgrade | Timelock + multisig |
| TIN squatting | First-come-first-served with deposits |

### Data Encryption

For audit logs, use:
- **Key derivation**: `HKDF` from owner key
- **Encryption**: `X25519` for key exchange, `ChaCha20-Poly1305` for data

## Deployment Commands

```bash
# Build
cd program && cargo build-bpf

# Deploy to devnet
solana program deploy target/deploy/tins.so --url devnet

# Initialize
 tins-cli init --authority <wallet> --fee-recipient <wallet>

# Create TIN
 tins-cli create-tin --owner <wallet>
```

## Program IDs

| Program | Devnet | Mainnet |
| --- | --- | --- |
| TINS | `5D2zKog251d6KPCyFyLMt3KroWwXXPWSgTPyhV22K2gR` | TBD |
| TSN | `Gx4M8KpDqJ2qJqJ2qJqJ2qJ2qJ2qJ2qJ2qJ2qJ2qJ2` | TBD |