use num_derive::FromPrimitive;
use solana_program::{decode_error::DecodeError, program_error::ProgramError};
use thiserror::Error;

#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
pub enum Error {
    #[error("Invalid instruction data")]
    InvalidInstruction,
    #[error("Overflow")]
    Overflow,
    #[error("Invalid name")]
    InvalidName,
    #[error("Name too long")]
    NameTooLong,
    #[error("The global state is already initialized")]
    GlobalStateAlreadyInitialized,
    #[error("The identity registry is already initialized")]
    RegistryAlreadyInitialized,
    #[error("Invalid PDA provided")]
    InvalidPda,
    #[error("TIN counter exhausted")]
    TinExhausted,
    #[error("The transfer identity number is invalid")]
    InvalidTin,
    #[error("Transfer amount must be positive")]
    InvalidAmount,
    #[error("Escrow is already claimed")]
    EscrowAlreadyClaimed,
    #[error("Unauthorized claimant")]
    UnauthorizedClaimant,
    #[error("Account is not owned by this program")]
    InvalidAccountOwner,
}

impl From<Error> for ProgramError {
    fn from(e: Error) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for Error {
    fn type_of() -> &'static str {
        "TinsError"
    }
}
