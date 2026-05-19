use crate::error::TinsError;
use crate::state::{GlobalConfig, IdentityRecord, IdentityType, LinkedIdentity, RateLimit};
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use solana_program::hash::hash;
use solana_program::secp256k1_recover;

/// Constants
const MAX_DISPLAY_NAME_LEN: usize = 32;
const MIN_ENTROPY_LEN: usize = 32;
const MAX_TINS_PER_HOUR: u32 = 100;
const TIN_TIMESTAMP_BITS: u64 = 42;  // ~140 years from 2025
const TIN_ENTROPY_BITS: u64 = 20;
const TIN_CHECK_BITS: u64 = 2;

/// Generate secure TIN using HMAC-like construction
/// TIN = (timestamp_entropy << 22) | (owner_entropy << 2) | check_bits
fn generate_secure_tin(
    owner_pubkey: &Pubkey,
    entropy: &[u8],
    clock: &Clock,
) -> Result<(u64, u8)> {
    require!(entropy.len() >= MIN_ENTROPY_LEN, TinsError::InsufficientEntropy);
    
    // Mix entropy sources: owner key + provided entropy + timestamp
    let mut data = Vec::with_capacity(32 + entropy.len() + 8);
    data.extend_from_slice(&owner_pubkey.to_bytes());
    data.extend_from_slice(entropy);
    data.extend_from_slice(&clock.unix_timestamp.to_le_bytes());
    
    // Hash to get pseudo-random bytes
    let hash_result = hash(&data);
    let hash_bytes = hash_result.to_bytes();
    
    // Extract components with bit manipulation to prevent enumeration
    // Upper bits: timestamp-based (can vary slowly)
    let timestamp_entropy = (clock.slot as u64) % (1 << TIN_TIMESTAMP_BITS);
    // Middle bits: from hash
    let owner_entropy = u64::from_le_bytes([
        hash_bytes[0], hash_bytes[1], hash_bytes[2], hash_bytes[3],
        hash_bytes[4] & 0x0F, 0, 0, 0  // Only use 36 bits
    ]) % (1 << TIN_ENTROPY_BITS);
    // Lower bits: check/discriminator (2 bits)
    let check_bits = (hash_bytes[5] & 0x03) as u8;
    
    // Combine into 8-digit TIN (10^8 - 1 = 99999999)
    let tin_base = (timestamp_entropy % 100_000_000) << 14;
    let tin_mid = (owner_entropy % 100_000) << 2;
    let tin = (tin_base | tin_mid | check_bits as u64) % 100_000_000;
    
    // Generate Luhn check digit
    let check_digit = luhn_check_digit(tin);
    
    Ok((tin, check_digit))
}

/// Luhn check digit (ISO 7064)
fn luhn_check_digit(number: u64) -> u8 {
    let mut sum = 0;
    let mut digits = number.to_string().chars().filter_map(|c| c.to_digit(10)).collect::<Vec<_>>();
    
    for (i, d) in digits.iter().rev().enumerate() {
        let mut val = *d;
        if i % 2 == 0 {
            val = val * 2;
            if val > 9 {
                val -= 9;
            }
        }
        sum += val;
    }
    
    ((10 - (sum % 10)) % 10) as u8
}

/// Validate display name
fn validate_display_name(name: &str) -> Result<()> {
    require!(!name.is_empty(), TinsError::InvalidDisplayName);
    require!(name.len() <= MAX_DISPLAY_NAME_LEN, TinsError::DisplayNameTooLong);
    
    // Allow only alphanumeric, spaces, hyphens, apostrophes
    for c in name.chars() {
        require!(
            c.is_alphanumeric() || c == ' ' || c == '-' || c == '\'',
            TinsError::InvalidDisplayName
        );
    }
    
    Ok(())
}

/// Initialize global config (one-time)
pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    fee_recipient: Pubkey,
    registration_fee: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.global_config;
    config.authority = ctx.accounts.authority.key();
    config.fee_recipient = fee_recipient;
    config.registration_fee = registration_fee;
    config.version = 1;
    config.bump = ctx.bumps.global_config;
    
    Ok(())
}

/// Register new TIN (main instruction)
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RegisterTinArgs {
    pub display_name: String,
    pub privacy_pubkey: Pubkey,
    pub entropy: Vec<u8>,
    pub identity_type: IdentityType,
    pub identity_hash: Option<[u8; 32]>,
}

pub fn register_tin(ctx: Context<RegisterTin>, args: RegisterTinArgs) -> Result<()> {
    // 1. Validate inputs
    validate_display_name(&args.display_name)?;
    require!(args.entropy.len() >= MIN_ENTROPY_LEN, TinsError::InsufficientEntropy);
    
    // 2. Check/restore rate limit
    let clock = &ctx.accounts.clock;
    let rate_limit = &mut ctx.accounts.rate_limit;
    let current_time = clock.unix_timestamp;
    
    // Reset hourly window if expired
    if current_time - rate_limit.window_start > 3600 {
        rate_limit.count_last_hour = 0;
        rate_limit.window_start = current_time;
    }
    
    // Check and increment
    require!(
        rate_limit.count_last_hour < MAX_TINS_PER_HOUR,
        TinsError::RateLimitExceeded
    );
    rate_limit.count_last_hour += 1;
    
    // 3. Generate secure TIN
    let (tin, check_digit) = generate_secure_tin(
        &ctx.accounts.signer.key(),
        &args.entropy,
        clock,
    )?;
    
    // Combine 8-digit base + check digit = 9 digits
    let final_tin = tin * 10 + check_digit as u64;
    
    // 4. Create identity record
    let identity = &mut ctx.accounts.identity;
    identity.display_name = args.display_name;
    identity.privacy_pubkey = args.privacy_pubkey;
    identity.owner = ctx.accounts.signer.key();
    identity.tin = final_tin;
    identity.created_at = clock.unix_timestamp;
    identity.identity_type = args.identity_type;
    identity.identity_hash = args.identity_hash.unwrap_or([0u8; 32]);
    identity.verified = false;
    identity.frozen = false;
    identity.bump = ctx.bumps.identity;
    identity.version = 1;
    
    // 5. If linking identity, create linked identity PDA
    if let Some(id_hash) = args.identity_hash {
        let linked = &mut ctx.accounts.linked_identity;
        linked.identity_type = args.identity_type;
        linked.identity_hash = id_hash;
        linked.tin = ctx.accounts.identity.key();
        linked.linked_at = clock.unix_timestamp;
        linked.verified = false;
    }
    
    // 6. Transfer registration fee (if > 0)
    let config = &ctx.accounts.global_config;
    if config.registration_fee > 0 {
        let cpi_program = ctx.accounts.system_program.to_account_info();
        let cpi_ctx = CpiContext::new(
            cpi_program,
            system_program::Transfer {
                from: ctx.accounts.signer.to_account_info(),
                to: config.fee_recipient.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, config.registration_fee)?;
    }
    
    Ok(())
}

/// Update display name
pub fn update_display_name(ctx: Context<UpdateDisplayName>, new_name: String) -> Result<()> {
    validate_display_name(&new_name)?;
    
    let identity = &mut ctx.accounts.identity;
    require!(identity.owner == ctx.accounts.signer.key(), TinsError::Unauthorized);
    identity.display_name = new_name;
    
    Ok(())
}

/// Freeze/unfreeze identity
pub fn set_frozen(ctx: Context<SetFrozen>, frozen: bool) -> Result<()> {
    let identity = &mut ctx.accounts.identity;
    require!(identity.owner == ctx.accounts.signer.key(), TinsError::Unauthorized);
    identity.frozen = frozen;
    
    Ok(())
}

/// Verify linked identity
pub fn verify_linked_identity(ctx: Context<VerifyLinkedIdentity>) -> Result<()> {
    let identity = &mut ctx.accounts.identity;
    require!(identity.owner == ctx.accounts.signer.key(), TinsError::Unauthorized);
    
    let linked = &mut ctx.accounts.linked_identity;
    linked.verified = true;
    identity.verified = true;
    
    Ok(())
}

/// Get TIN by lookup
pub fn find_by_tin(ctx: Context<FindByTin>) -> Result<IdentityRecord> {
    let identity = &ctx.accounts.identity;
    Ok(identity.clone())
}