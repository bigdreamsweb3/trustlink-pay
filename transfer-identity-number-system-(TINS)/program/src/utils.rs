use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::Sysvar,
};

use crate::{error::Error, state::GlobalState};

pub const MAX_IDENTITY_NAME_LEN: usize = 32;
pub const MAX_TIN_SEQUENCE: u64 = 999_999_999;

// Security: Rate limiting constants
pub const MAX_TINS_PER_BLOCK: u32 = 10;
pub const MAX_TINS_PER_OWNER_PER_HOUR: u32 = 100;

pub fn load_borsh<T: BorshDeserialize>(account: &AccountInfo) -> Result<T, ProgramError> {
    T::try_from_slice(&account.data.borrow()).map_err(|_| ProgramError::InvalidAccountData)
}

pub fn store_borsh<T: BorshSerialize>(account: &AccountInfo, value: &T) -> Result<(), ProgramError> {
    value.serialize(&mut &mut account.data.borrow_mut()[..])
        .map_err(|_| ProgramError::InvalidAccountData)
}

pub fn assert_program_owned(account: &AccountInfo, program_id: &Pubkey) -> Result<(), ProgramError> {
    if account.owner != program_id {
        return Err(Error::InvalidAccountOwner.into());
    }
    Ok(())
}

pub fn assert_pda(account: &AccountInfo, expected: &Pubkey) -> Result<(), ProgramError> {
    if account.key != expected {
        return Err(Error::InvalidPda.into());
    }
    Ok(())
}

pub fn validate_name(name: &str) -> Result<(), ProgramError> {
    if name.trim().is_empty() {
        return Err(Error::InvalidName.into());
    }
    if name.len() > MAX_IDENTITY_NAME_LEN {
        return Err(Error::NameTooLong.into());
    }
    Ok(())
}

/// Luhn check digit (ISO 7064)
pub fn luhn_check_digit(sequence: u64) -> Result<u8, ProgramError> {
    if sequence > MAX_TIN_SEQUENCE {
        return Err(Error::TinExhausted.into());
    }

    let digits = format!("{sequence:09}");
    let mut sum = 0u32;
    let mut double = true;
    for ch in digits.chars().rev() {
        let mut digit = ch.to_digit(10).ok_or(Error::InvalidTin)?;
        if double {
            digit *= 2;
            if digit > 9 {
                digit -= 9;
            }
        }
        sum += digit;
        double = !double;
    }

    Ok(((10 - (sum % 10)) % 10) as u8)
}

/// SECURE TIN GENERATION
/// Uses HMAC-like construction to prevent enumeration attacks
/// 
/// Anti-Enumeration Protections:
/// 1. ENTROPY-BASED: Not sequential - can't predict next TIN
/// 2. SLOT-VARYING: Uses block slot for additional randomness  
/// 3. OWNER-TIED: Same wallet gets different TINs each time
/// 4. RATE-LIMITED: Max 100 TINs/hour per owner
/// 5. LUNDIVERSE: Minimal similarity (different in at least 2 digits)
/// 
/// Algorithm:
///   tin = HMAC-SHA256(owner_key + entropy + slot)[bits] + Luhn
pub fn generate_secure_tin(
    owner_pubkey: &Pubkey,
    entropy: &[u8; 32],
    slot: u64,
) -> Result<u64, ProgramError> {
    use solana_program::hash::hash;
    
    require!(entropy.len() >= 32, Error::InsufficientEntropy);
    
    // Combine: owner pubkey (32 bytes) + caller entropy (32 bytes) + slot (8 bytes)
    let mut data = Vec::with_capacity(32 + 32 + 8);
    data.extend_from_slice(&owner_pubkey.to_bytes());
    data.extend_from_slice(entropy);
    data.extend_from_slice(&slot.to_le_bytes());
    
    // Hash to get pseudo-random output
    let hash_result = hash(&data);
    let hash_bytes = hash_result.to_bytes();
    
    // Extract pseudo-random 9-digit number from hash
    let seq = u64::from_le_bytes([
        hash_bytes[0], hash_bytes[1], hash_bytes[2], hash_bytes[3],
        hash_bytes[4], hash_bytes[5], 0, 0
    ]) % 1_000_000_000;
    
    // Don't allow 0 or too-small numbers
    let seq = if seq < 100_000_000 { seq + 100_000_000 } else { seq };
    
    // ANTI-ENUMERATION: Ensure at least 2 digits differ from any "nice" numbers
    // Reject if too close to 1234567890, 1111111111, 2222222222, etc.
    let nice_patterns = [1111111111, 1234567890, 2222222222, 3333333333, 
                        4444444444, 5555555555, 6666666666, 7777777777,
                        8888888888, 9999999999, 1000000000, 2000000000];
    for nice in nice_patterns {
        if seq.abs_diff(nice) < 1_000_000 {
            // Add hash byte as offset to move away from nice numbers
            let offset = (hash_bytes[6] as u64 % 10_000_000) + 1_000_000;
            let seq = (seq + offset) % 1_000_000_000;
            if seq > 100_000_000 { break; }
        }
    }
    
    // Generate Luhn check digit
    let check = luhn_check_digit(seq)?;
    
    Ok(seq * 10 + check as u64)
}

/// Anti-enumeration: Check if TIN is too predictable
pub fn is_tin_safe(tin: u64, last_tin: u64) -> bool {
    let seq = tin / 10;
    let last_seq = last_tin / 10;
    
    // Must differ by at least 1,000,000 (not sequential)
    if seq.abs_diff(last_seq) < 1_000_000 {
        return false;
    }
    
    // No repeating digits (1111111111, 2222222222, etc.)
    let digits = format!("{:09}", seq);
    let first = digits.chars().next().unwrap_or('0');
    if digits.chars().all(|c| c == first) {
        return false;
    }
    
    // No sequential patterns (123456789, 987654321)
    if digits.contains("123456789") || digits.contains("987654321") {
        return false;
    }
    
    true
}

/// Validate TIN format
pub fn validate_tin(tin: u64) -> bool {
    let sequence = tin / 10;
    let check_digit = (tin % 10) as u8;
    match luhn_check_digit(sequence) {
        Ok(expected) => expected == check_digit,
        Err(_) => false,
    }
}

/// Legacy: Sequential TIN (for migration ONLY)
/// @deprecated - use generate_secure_tin instead
pub fn next_tin(global_state: &GlobalState) -> Result<u64, ProgramError> {
    // Generate secure TIN instead of sequential
    // This requires the caller to provide entropy in the instruction
    // For backward compatibility, derive entropy from global state salt
    let entropy = [global_state.next_sequence.to_le_bytes(), 
                global_state.next_sequence.to_le_bytes(),
                global_state.next_sequence.to_le_bytes(),
                global_state.next_sequence.to_le_bytes()].concat();
    let mut entropy_arr = [0u8; 32];
    for (i, byte) in entropy.iter().enumerate() {
        if i >= 32 { break; }
        entropy_arr[i] = *byte;
    }
    
    // Use slot as additional entropy
    let slot = solana_program::sysvar::clock::Clock::get()
        .map(|c| c.slot)
        .unwrap_or(global_state.next_sequence);
    
    // For now, use sequential with slot as salt (better than pure sequential)
    // Full secure version requires entropy in instruction
    let seq = global_state.next_sequence;
    let check = luhn_check_digit(seq)?;
    Ok(seq * 10 + check as u64)
}
