use num_traits::FromPrimitive;
use solana_program::{
    account_info::AccountInfo, decode_error::DecodeError, entrypoint::ProgramResult, msg,
    program_error::PrintProgramError, pubkey::Pubkey,
};

use crate::{error::Error, processor::Processor};

#[cfg(not(feature = "no-entrypoint"))]
use solana_program::entrypoint;
#[cfg(not(feature = "no-entrypoint"))]
entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("TINS entrypoint");
    if let Err(error) = Processor::process_instruction(program_id, accounts, instruction_data) {
        error.print::<Error>();
        return Err(error);
    }
    Ok(())
}

impl PrintProgramError for Error {
    fn print<E>(&self)
    where
        E: 'static + std::error::Error + DecodeError<E> + PrintProgramError + FromPrimitive,
    {
        match self {
            Error::InvalidInstruction => msg!("Error: invalid instruction"),
            Error::Overflow => msg!("Error: overflow"),
            Error::InvalidName => msg!("Error: invalid identity name"),
            Error::NameTooLong => msg!("Error: identity name too long"),
            Error::GlobalStateAlreadyInitialized => msg!("Error: global state already initialized"),
            Error::RegistryAlreadyInitialized => msg!("Error: registry already initialized"),
            Error::InvalidPda => msg!("Error: invalid PDA"),
            Error::TinExhausted => msg!("Error: TIN counter exhausted"),
            Error::InvalidTin => msg!("Error: invalid TIN"),
            Error::InvalidAmount => msg!("Error: invalid amount"),
            Error::EscrowAlreadyClaimed => msg!("Error: escrow already claimed"),
            Error::UnauthorizedClaimant => msg!("Error: unauthorized claimant"),
            Error::InvalidAccountOwner => msg!("Error: invalid account owner"),
        }
    }
}
