use solana_program::{declare_id, pubkey::Pubkey};

pub mod cpi;
pub mod entrypoint;
pub mod error;
pub mod instruction_auto;
pub mod processor;
pub mod state;
pub mod utils;

pub use error::Error;

// Temporary development program ID placeholder until the TINS deployment key is assigned.
declare_id!("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");

pub mod seeds {
    pub const GLOBAL_STATE: &[u8] = b"global-state";
    pub const REGISTRY: &[u8] = b"registry";
    pub const ESCROW: &[u8] = b"escrow";
    pub const VAULT: &[u8] = b"vault";
    pub const IDENTITY: &[u8] = b"identity";
}

pub const PROGRAM_SALT: &[u8] = b"TINS_SALT_2026";

pub fn identity_pda(program_id: &Pubkey, identity_seed: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[seeds::IDENTITY, identity_seed], program_id)
}

pub fn registry_pda(program_id: &Pubkey, tin: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[seeds::REGISTRY, &tin.to_le_bytes()], program_id)
}

pub fn escrow_pda(program_id: &Pubkey, tin: u64, escrow_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[seeds::ESCROW, &tin.to_le_bytes(), &escrow_id.to_le_bytes()],
        program_id,
    )
}

pub fn vault_pda(program_id: &Pubkey, tin: u64, escrow_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[seeds::VAULT, &tin.to_le_bytes(), &escrow_id.to_le_bytes()],
        program_id,
    )
}

pub fn global_state_pda(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[seeds::GLOBAL_STATE], program_id)
}
