use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

use crate::error::Error;

pub const MAX_TIN_SEQUENCE: u64 = 999_999_999;

pub fn load_borsh<T: BorshDeserialize>(account: &AccountInfo) -> Result<T, ProgramError> {
    T::try_from_slice(&account.data.borrow()).map_err(|_| ProgramError::InvalidAccountData)
}

pub fn load_borsh_with_zero_padding<T: BorshDeserialize>(account: &AccountInfo) -> Result<T, ProgramError> {
    let data = account.data.borrow();
    let mut remaining = &data[..];
    let value = T::deserialize(&mut remaining).map_err(|_| ProgramError::InvalidAccountData)?;
    if remaining.iter().any(|byte| *byte != 0) {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(value)
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

