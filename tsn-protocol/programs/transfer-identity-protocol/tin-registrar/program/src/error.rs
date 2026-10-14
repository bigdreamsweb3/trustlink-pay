use num_derive::FromPrimitive;
use solana_program::{decode_error::DecodeError, program_error::ProgramError};
use thiserror::Error;

#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
pub enum Error {
    #[error("Invalid instruction data")]
    InvalidInstruction = 0,
    #[error("Overflow")]
    Overflow = 1,
    #[error("The global state is already initialized")]
    GlobalStateAlreadyInitialized = 4,
    #[error("The identity registry is already initialized")]
    RegistryAlreadyInitialized = 5,
    #[error("Invalid PDA provided")]
    InvalidPda = 6,
    #[error("TIN counter exhausted")]
    TinExhausted = 7,
    #[error("Account is not owned by this program")]
    InvalidAccountOwner = 12,
    #[error("Signature verification failed")]
    SignatureVerificationFailed = 13,
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
