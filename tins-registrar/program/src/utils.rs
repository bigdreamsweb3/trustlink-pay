use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::AccountInfo,
    program::invoke,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

use crate::{error::Error, state::GlobalState};

pub const MAX_IDENTITY_NAME_LEN: usize = 32;
pub const MAX_IDENTITY_TYPE_LEN: usize = 32;
pub const MAX_IDENTITY_LABEL_LEN: usize = 64;
pub const MAX_IDENTITY_METADATA_LEN: usize = 512;
pub const MAX_IDENTITY_CIPHERTEXT_LEN: usize = 1024;
pub const MAX_IDENTITY_NONCE_LEN: usize = 32;
pub const MAX_TIN_SEQUENCE: u64 = 999_999_999;

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

pub fn validate_identity_type(value: &str) -> Result<(), ProgramError> {
    if value.trim().is_empty() || value.len() > MAX_IDENTITY_TYPE_LEN {
        return Err(Error::InvalidInstruction.into());
    }
    Ok(())
}

pub fn validate_identity_label(value: &str) -> Result<(), ProgramError> {
    if value.len() > MAX_IDENTITY_LABEL_LEN {
        return Err(Error::InvalidInstruction.into());
    }
    Ok(())
}

pub fn validate_metadata(value: &str) -> Result<(), ProgramError> {
    if value.len() > MAX_IDENTITY_METADATA_LEN {
        return Err(Error::InvalidInstruction.into());
    }
    Ok(())
}

pub fn validate_encrypted_blob(nonce: &[u8], ciphertext: &[u8]) -> Result<(), ProgramError> {
    if nonce.is_empty()
        || nonce.len() > MAX_IDENTITY_NONCE_LEN
        || ciphertext.is_empty()
        || ciphertext.len() > MAX_IDENTITY_CIPHERTEXT_LEN
    {
        return Err(Error::InvalidInstruction.into());
    }
    Ok(())
}

pub fn top_up_and_realloc<'a>(
    payer: &AccountInfo<'a>,
    target: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    new_space: usize,
) -> Result<(), ProgramError> {
    let rent = Rent::get()?;
    let required_lamports = rent.minimum_balance(new_space);
    let current_lamports = **target.lamports.borrow();
    if required_lamports > current_lamports {
        let top_up = required_lamports
            .checked_sub(current_lamports)
            .ok_or(Error::Overflow)?;
        invoke(
            &system_instruction::transfer(payer.key, target.key, top_up),
            &[payer.clone(), target.clone(), system_program.clone()],
        )?;
    }
    target.realloc(new_space, false)?;
    Ok(())
}

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

pub fn generate_tin(sequence: u64) -> Result<u64, ProgramError> {
    let check_digit = luhn_check_digit(sequence)? as u64;
    Ok(sequence
        .checked_mul(10)
        .and_then(|value| value.checked_add(check_digit))
        .ok_or(Error::Overflow)?)
}

pub fn validate_tin(tin: u64) -> bool {
    let sequence = tin / 10;
    let check_digit = (tin % 10) as u8;
    match luhn_check_digit(sequence) {
        Ok(expected) => expected == check_digit,
        Err(_) => false,
    }
}

pub fn next_tin(global_state: &GlobalState) -> Result<u64, ProgramError> {
    generate_tin(global_state.next_sequence)
}

#[cfg(test)]
mod tests {
    use super::{generate_tin, validate_tin};

    #[test]
    fn generated_tins_pass_luhn_validation() {
        let tin = generate_tin(123_456_789).unwrap();
        assert_eq!(tin, 1234567897);
        assert!(validate_tin(tin));
        assert!(!validate_tin(1234567890));
    }
}
