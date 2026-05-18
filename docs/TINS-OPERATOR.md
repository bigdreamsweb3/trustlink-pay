# TINS Operator Guide

Complete guide for running and managing TINS.

## Table of Contents

1. [Recovery Wallets](#recovery-wallets)
2. [Team Fees](#team-fees)
3. [Registration](#registration)
4. [Wallet Rotation](#wallet-rotation)
5. [Full Checklist](#full-checklist)

---

## Recovery Wallets

When you create a TIN, you can add up to **3 recovery wallets**. These are critical for security.

### Why Recovery Wallets?

| Scenario | Without | With Recovery |
|----------|---------|--------------|
| Lost wallet | Lose TIN forever | Rotate to new wallet |
| Wallet stolen | Hacker takes everything | Need 2/3 wallets to recover |
| Dead wallet | Funds lost | Recovery wallets recover |

### Adding Recovery Wallets

```typescript
// Via CLI
tinctl recovery add --wallet <new-recovery-wallet> --tin TIN-XXXX-XXXX

// Via SDK
await tinsdk.addRecoveryWallet({
  tin: "TIN-XXXX-XXXX",
  recoveryWallet: newPubkey,
});
```

### Recovery Wallet Rules

1. **Minimum 1** recovery wallet recommended
2. **Maximum 3** recovery wallets allowed
3. **Diversity**: Different wallets, different security
4. **Trusted**: Only wallets YOU control

### Setting Recovery Wallets (On-Chain)

```rust
// In InitializeIdentity instruction
pub struct InitializeIdentityParams {
    pub display_name: String,
    pub privacy_pubkey: Pubkey,           // Derived from main wallet
    pub verifying_pubkey: Option<Pubkey>, // Optional verification
    pub path_index: u32,                 // BIP-44 path
    pub recovery_wallets: [Option<Pubkey>; 3],  // YOUR recovery options
}
```

### Recovery Requirements

To change your privacy key (wallet rotation):

| Step | Who Can Do It |
|------|--------------|
| 1. Initiate | Any recovery wallet |
| 2. Confirm | Second recovery wallet |
| 3. Wait | 24-72 hour cooldown |
| 4. Activate | After confirmation |

**Hacker with ONLY 1 wallet CANNOT change your TIN.**

---

## Team Fees

TINS charges small fees to fund ecosystem development and prevent abuse.

### Fee Structure

| action | Fee | Purpose |
|--------|-----|---------|
| Create TIN | 0.01 SOL | First-time registration |
| Update name | 0.001 SOL | Change display name |
| Add recovery | 0.002 SOL | Add recovery wallet |
| Wallet rotate | 0.005 SOL | Change privacy key |
| Lookup | FREE | Read-only |

### Why Fees Matter

```
FREE system = HACKER playground
❌ Mass TIN creation attacks
❌ Spam TIN registrations  
❌ No incentive to maintain

PAID system = PROTECTED
✅ Prevents abuse
✅ Funds development
✅ Shows real users care
```

### Fee Distribution

```
All fees go to team treasury for development and maintenance.
```
No burn - all fees fund the team!

### Implementing Fees (On-Chain)

```rust
// In initialize_identity instruction
pub fn initialize_identity(
    ctx: Context<InitializeIdentity>,
    params: InitializeIdentityParams,
) -> Result<()> {
    // Fee: 0.01 SOL = 10,000,000 lamports
    let fee = 10_000_000u64;
    
    // Transfer to team treasury
    let team_treasury = ctx.accounts.team_treasury.key();
    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
            from: ctx.accounts.signer.to_account_info(),
            to: team_treasury.to_account_info(),
        },
    );
    system_program::transfer(cpi_ctx, fee)?;
    
    // ... continue with TIN creation
}
```

### Team Treasury Address

Configure in `GlobalConfig`:

```rust
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub team_treasury: Pubkey,  // Where fees go
    pub fee_create: u64,        // 0.01 SOL
    pub fee_rotate: u64,        // 0.005 SOL
    pub fee_update: u64,        // 0.001 SOL
    pub fee_recovery: u64,      // 0.002 SOL
    pub version: u8,
}
```

---

## Registration

### Full Registration Flow

```typescript
// 1. Generate privacy key from main wallet
const privacyKey = derivePrivacyKey(mainWallet);

// 2. Create TIN with fees
const tx = await tinsdk.registerTin({
  displayName: "Daniel Ochieng",
  privacyPubkey: privacyKey,
  pathIndex: 0,                    // m/44'/501'/0'/0'
  recoveryWallets: [recovery1, recovery2],  // 2 of 3
  feePayer: mainWallet,
});

// 3. Sign and submit
await mainWallet.signTransaction(tx);
await connection.sendTransaction(tx);
```

### What Gets Stored On-Chain

| Field | On-Chain? | Visible? |
|-------|-----------|----------|
| `tin` | Yes | Yes |
| `privacy_pubkey` | Yes | Yes |
| `display_name` | Yes | Yes |
| `recovery_wallets` | Yes | NO (private) |
| `main_wallet` | **NO** | **NEVER** |
| `private_key` | **NO** | **NEVER** |

---

## Wallet Rotation

### When to Rotate

1. Wallet leaked or compromised
2. Want to change to new wallet
3. Adding/removing recovery wallets

### Rotation Process

```
STEP 1: ANY recovery wallet initiates
────────────────────────────────────────
User (with recovery wallet) signs:
"I want to rotate TIN-1234-5678 to new wallet"

→ Creates pending rotation request
→ 24hr countdown starts

STEP 2: SECOND recovery wallet confirms  
────────────────────────────────────────
Different recovery wallet signs:
"I confirm rotation request"

→ 2/3 confirmations received
→ Status: CONFIRMED

STEP 3: COOLDOWN PERIOD (24-72 hours)
────────────────────────────────────────
- Notifications sent (email, SMS, WhatsApp)
- User can cancel during this period
- No funds move yet

STEP 4: ACTIVATION
────────────────────────────────────────
After cooldown + confirmation:
- privacy_pubkey changes to NEW wallet
- old pending_rotation cleared
- nonce increments (prevents replay)
```

### Rotation Code

```rust
// Initiate rotation
pub fn initiate_rotation(
    ctx: Context<Rotate>,
    new_privacy_pubkey: Pubkey,
) -> Result<()> {
    // 1. Verify caller is recovery wallet
    require!(is_recovery_wallet(&identity, ctx.signer.key()));
    
    // 2. Create pending request
    identity.pending_rotation = Some(RotationRequest {
        new_privacy_pubkey,
        requested_at: clock.unix_timestamp,
        confirmations: 0,
        status: 0,  // pending
    });
    
    // 3. Charge rotation fee
    let fee = ctx.accounts.global_config.fee_rotate;
    transfer_to_treasury(fee)?;
    
    Ok(())
}

// Confirm rotation  
pub fn confirm_rotation(ctx: Context<Rotate>) -> Result<()> {
    // Must be DIFFERENT recovery wallet
    require!(is_different_recovery(&identity, ctx.signer.key()));
    
    // Increment confirmations
    identity.pending_rotation.confirmations += 1;
    
    // If 2/3, apply
    if identity.pending_rotation.confirmations >= 2 {
        identity.pending_rotation.status = 1; // confirmed
        identity.apply_rotation()?;
    }
    
    Ok(())
}
```

---

## Full Payment-Certified Checklist

For TINS to be production-ready:

### Security

- [x] Main wallet NEVER on-chain
- [x] Privacy key derived (BIP-44)
- [x] Display name verification
- [x] Anti-enumeration TINs
- [x] Rate limiting
- [x] Multi-sig wallet rotation
- [x] 24hr cooldown
- [x] Notifications

### Economics

- [x] Registration fees
- [x] Rotation fees  
- [x] Team treasury

### Functionality

- [x] TIN creation
- [x] Lookup by TIN
- [x] Display name lookup
- [x] Recovery wallets
- [ ] Phone linking (future)
- [ ] Email linking (future)
- [ ] Social linking (future)

### Operations

- [ ] CLI tool
- [ ] Dashboard
- [ ] Monitoring
- [ ] Alerting

### Audits

- [ ] Code audit
- [ ] Security audit
- [ ] Formal verification (optional)

---

## CLI Reference

```bash
# Create TIN
tinctl create --name "John Doe" --wallet <key>

# Lookup TIN
tinctl lookup TIN-1234-5678

# Update display name
tinctl update-name --tin TIN-1234-5678 --new-name "John Smith"

# Add recovery wallet
tinctl recovery add --tin TIN-1234-5678 --wallet <recovery-key>

# Initiate rotation
tinctl rotate --tin TIN-1234-5678 --new-wallet <new-key>

# Confirm rotation
tinctl confirm --tin TIN-1234-5678

# View TIN info
tinctl info --tin TIN-1234-5678
```

---

## Contract Addresses

| Network | Address |
|----------|---------|
| Devnet | `TINS111111111111111111111111111111111111` |
| Mainnet | (Deploy on mainnet) |