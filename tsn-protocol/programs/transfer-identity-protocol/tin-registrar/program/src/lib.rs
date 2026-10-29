use solana_program::{declare_id, pubkey::Pubkey};

pub mod cpi;
pub mod entrypoint;
pub mod error;
pub mod instruction_auto;
pub mod processor;
pub mod route_root;
pub mod state;
pub mod utils;

pub use error::Error;

declare_id!("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT");

pub mod seeds {
    pub const GLOBAL_STATE: &[u8] = b"global-state";
    pub const TIP_ROUTE_ROOT_V1: &[u8] = b"tip:route-merkle-root:v1";
    pub const TIN_V1_CREATE_STAGE: &[u8] = b"tin-v1-create-stage";
    pub const TIN_V1: &[u8] = b"tin-v1";
    pub const TIN_V1_OWNER_RECOVERY: &[u8] = b"tin-v1-owner-recovery";
}

pub fn tip_route_root_pda(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[seeds::TIP_ROUTE_ROOT_V1], program_id)
}

pub const PROGRAM_SALT: &[u8] = b"TINS_SALT_2026";

pub fn global_state_pda(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[seeds::GLOBAL_STATE], program_id)
}

pub fn tin_v1_creation_staging_pda(
    program_id: &Pubkey,
    owner_pubkey: &Pubkey,
    intent_hash: &[u8; 32],
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[seeds::TIN_V1_CREATE_STAGE, owner_pubkey.as_ref(), intent_hash],
        program_id,
    )
}

pub fn tin_v1_pda(program_id: &Pubkey, lookup_commitment: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[seeds::TIN_V1, lookup_commitment], program_id)
}

pub fn tin_v1_owner_recovery_pda(program_id: &Pubkey, owner: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[seeds::TIN_V1_OWNER_RECOVERY, owner.as_ref()], program_id)
}
