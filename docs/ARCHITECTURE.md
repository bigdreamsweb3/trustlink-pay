# TrustLink Pay Identity System - Current vs TINS

This document explains the current backend identity system and how TINS replaces it with an on-chain solution.

---

## Part 1: Current Backend Identity System

### How TrustLink Pay Identity Works Today

```
User Registration Flow:
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  User        │────▶│  WhatsApp  │────▶│  Backend   │
│  enters     │     │  OTP       │     │  Database  │
│  phone     │     │  verify    │     │  Phone →  │
│  number    │     │           │     │  Wallet   │
└──────────────┘     └──────────────┘     └──────────────┘
                                         
Current Database Table (simplified):
┌────────────────────┬──────────────────┬──────────────────┐
│ phone_number      │ wallet_address  │ created_at      │
├────────────────────┼──────────────────┼──────────────────┤
│ +2348012345678    │ DGV...abc123    │ 1700000000     │
│ +2348012345679    │ DGV...def456   │ 1700000100     │
└────────────────────┴──────────────────┴──────────────────┘
```

### Problems with Current System

1. **Single point of failure**: If backend goes down, identity resolution stops
2. **Censorship risk**: TrustLink can block/resolve identities
3. **Privacy leakage**: Backend sees all payment relationships
4. **No portability**: Can't use identity outside TrustLink

---

## Part 2: TINS On-Chain Identity

### What TINS Changes

```
User Registration Flow (with TINS):
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  User      │────▶│  On-chain │────▶│  TIN      │
│  creates  │     │  Program │     │  PDA      │
│  wallet   │     │  TX      │     │  TIN-XXXX-XXXX │
└──────────────┘     └──────────────┘     └──────────────┘

On-Chain State:
┌─────────────────────────────────────────────────────┐
│ IdentityRegistry PDA (per TIN)                     │
├─────────────────────────────────────────────────────┤
│ display_name: "Daniel Ochieng"  # Shown before send│
│ privacy_pubkey: DGV...abc123    # Derived key      │
│ tin: 12345678                   # TIN number       │
│ created_at: 1700000000          # Timestamp        │
│ identity_type: 1                # 0=wallet,1=phone │
└─────────────────────────────────────────────────────┘
```

### Anti-Scam: Name Verification

Before sending, sender sees:
```
Confirm: Sending 100 USDC to Daniel Ochieng (TIN-1234-5678)?
```

### TIN Format

A TIN is 10 digits: `TIN-XXXX-XXXX`

| Component | Value |
| --- | --- |
| Prefix | `TIN-` |
| First 4 | Random-ish (sequence) |
| Last 4 | Check digit |

Example: `TIN-1234-5678`

### TINS Accounts

| Account | PDA Derivation | Purpose |
| --- | --- | --- |
| GlobalState | `["global"]` | Protocol config, fee recipient |
| IdentityRegistry | `["identity", tin.to_le_bytes()]` | Per-TIN data |
| LinkedIdentity | `["linked", hash]` | Phone/social → TIN mapping |

> **Correction**: TIN stores the user's **privacy public key**, not their main wallet address.
> - Privacy key = derived from main wallet (using BIP-44 or similar)
> - Each transaction uses a **new derived address** from the privacy key
> - Only the main wallet can sign/authorize transactions from derived addresses
> - On-chain: no link between user's main wallet and their payment addresses

---

## Part 3: Privacy Analysis

### What Everyone Can See (On-Chain)

| Data | Who Sees | Privacy Risk |
| --- | --- | --- |
| TIN → owner wallet | Everyone | Low - expected for routing |
| Identity created | Everyone | Low - required for UX |
| TIN number | Everyone | Low - identifier only |
| Linked identity hash | Everyone | Medium - can verify link exists |

### What Is Private

| Data | Who Sees |
| --- | --- |
| Actual phone number | Only owner (not stored on-chain) |
| Social handles | Only owner |
| Payment history | Not linked (via TSN) |
| Payment amounts | Not linked (via TSN) |

### Privacy Leakage Risks

| Risk | Description | Mitigation |
| --- | --- | --- |
| **Enumeration** | Anyone can query all TINs | Expected - allows verification |
| **Linking** | Same phone linked to multiple TINs | Don't link same phone to multiple TINs |
| **Timing** | When identity created/updated | None - design choice |
| **TSN linking** | Without TSN, payments reveal wallets | Always use TSN |

---

## Part 4: TSN Integration

### How TSN Uses TINS

TSN resolves recipient TIN → wallet for payment:

```
TSN Payment Flow:
1. Sender enters: "TIN-1234-5678"
2. TSN calls TINS: resolve_tin(12345678)
3. TINS returns: owner_wallet = DGV...abc123
4. TSN creates: PaymentIntent with recipient = DGV...abc123
5. TSN settles: Cranker pays recipient from vault
```

### TSN → TINS CPI Code

```rust
// In TSN program - resolve TIN to get owner wallet
pub fn resolve_tin(tins_program: Pubkey, tin: u64) -> Result<Pubkey> {
    let (registry_pda, _) = Pubkey::find_program_address(
        &[b"identity", &tin.to_le_bytes()],
        &tins_program,
    );
    let account = Account::load(&registry_pda)?;
    let identity = IdentityRegistry::deserialize(&account.data)?;
    Ok(identity.owner)
}
```

### TSN Payments Without TIN Visibility

The key privacy feature: TSN separates sender ↔ recipient wallets

```
Without TSN:
  Sender Wallet → [on-chain] → Recipient Wallet
  (everyone sees: sender sent X to recipient)

With TSN:
  Sender Wallet → [escrow] → Cranker → [vault] → Recipient Wallet  
  (on-chain: sender → escrow, escrow → vault → recipient)
  (no direct link visible)
```

---

## Part 5: Link Identities to TIN

### Option 1: Wallet-Only TIN

Create TIN for bare wallet:

```rust
// Create TIN that just represents a wallet
invoke(
    &create_tin_ix,
    &[global_state, user_token_account, user],
)?;
// Result: TIN-XXXX-XXXX owned by user's wallet
```

### Option 2: Phone-Linked TIN

Link phone number to TIN:

```rust
// Hash the phone ( don't store actual number )
let phone_hash = sha256("+2348012345678");

// Link to TIN
invoke(
    &link_identity_ix,
    &[identity_registry, linked_identity, owner, system_program],
)?;
// On-chain: hash stored, not phone number
// Verification: owner proves knowledge of phone
```

### Identity Verification Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Owner     │────▶│  TINS     │────▶│  Verified │
│  proves   │     │  checks   │     │  flag set │
│  +phone   │     │  proof   │     │  = true   │
└──────────────┘     └──────────────┘     └──────────────┘

Verification can be:
- WhatsApp OTP (off-chain, via TrustLink)
- Signature proving phone ownership
- Other social verification
```

---

## Part 6: Cranker Privacy Improvements

### Problem: Crankers See Too Much

Current Cranker can see:
- Sender wallet
- Recipient wallet  
- Payment amount
- Payment metadata

This violates privacy - operators shouldn't see user data.

### Solution 1: Split Execution

```
Before (visible):
  Cranker receives: {sender: DGV...A, recipient: DGV...B, amount: 100}

After (private):
  Cranker receives: encrypted blob
  Cranker executes: vault.transfer(to: recipient_wallet)
  Cranker submits: proof (encrypted)
```

### Solution 2: Encrypted Memos

```rust
// Payment metadata encrypted with shared secret
let shared_secret = derive_shared_key(sender, recipient);
let encrypted_memo = encrypt({
    sender: sender_wallet,
    recipient: recipient_wallet, 
    amount: amount,
}, shared_secret);

// Only sender/recipient can decrypt
// Cranker sees only: encrypted blob
```

### Solution 3: Encrypted Audit Trail

```rust
// Cranker stores encrypted proof locally
struct EncryptedProof {
    payment_id: [u8; 32],
    ciphertext: Vec<u8>,  // Encrypted with protocol key
    nonce: [u8; 24],
}

// Cranker can submit proof
// Protocol can verify
// No one (including Cranker) can read details
```

### Solution 4: Cranker Key Separation

```rust
// Cranker has two keys:
struct CrankerKeys {
    execute_key: Pubkey,    // For signing executions
    encrypt_key: Pubkey,   // For encrypting data
}

// Verify: use encrypt_key
// Use: only execute_key for on-chain
// Read: never, audit stored encrypted
```

---

## Summary

| Feature | Current Backend | TINS + TSN |
| --- | --- | --- |
| Identity storage | Database | On-chain PDA |
| Resolution | API call | Program CPI |
| Privacy | Backend sees all | Separated via TSN |
| Portability | TrustLink-only | Any app |
| Censorship | Possible | Program rules only |

---

## Next Steps

1. **Review this design** - understand the architecture
2. **Decide on implementation** - confirm approach
3. **Implement TINS** - if approved
4. **Integrate with TSN** - resolve TINs on-chain
5. **Improve Cranker privacy** - encryption layer

Questions to answer before implementing:
- Acceptable privacy trade-offs?
- Encryption approach preference?
- Gradual migration or full cutover?