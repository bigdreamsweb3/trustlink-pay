//! Shared GPRU proof-context contract for Solana 1.18.26.
//!
//! This crate is deliberately a library, not a deployable program: the GPRU
//! program ID and account ownership contract have not yet been assigned. It
//! provides strict decoding of proof contexts emitted by Solana's native ZK
//! Token proof program. A context passing these checks is not, by itself, a
//! balance transition authorization; callers must also prove the relation from
//! the current ciphertext to this successor ciphertext.

pub mod proofs;
pub mod state;
