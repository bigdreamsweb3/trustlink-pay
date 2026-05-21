use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

pub const CURRENT_VERSION: u8 = 1;
pub const IDENTITY_ACTIVE: u8 = 1;
pub const ESCROW_PENDING: u8 = 0;
pub const ESCROW_CLAIMED: u8 = 1;

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct GlobalState {
    pub version: u8,
    pub bump: u8,
    pub reserved: [u8; 6],
    pub next_sequence: u64,
}

impl GlobalState {
    pub const LEN: usize = 16;
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct IdentityRegistry {
    pub version: u8,
    pub bump: u8,
    pub status: u8,
    pub reserved: [u8; 5],
    pub tin: u64,
    pub authority: Pubkey,
    pub master_privacy: Pubkey,
    pub last_escrow_id: u64,
    pub created_at: i64,
    pub name: String,
}

impl IdentityRegistry {
    pub fn space(name: &str) -> usize {
        100 + name.len()
    }
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct EscrowState {
    pub version: u8,
    pub bump: u8,
    pub status: u8,
    pub reserved: [u8; 5],
    pub tin: u64,
    pub escrow_id: u64,
    pub amount: u64,
    pub payer: Pubkey,
    pub recipient_authority: Pubkey,
    pub vault: Pubkey,
    pub created_at: i64,
    pub claimed_at: i64,
    pub destination: Pubkey,
}

impl EscrowState {
    pub const LEN: usize = 176;
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct TinAccount {
    pub tin: u64,                     // 10-digit ID
    pub display_name: String,         // public identity
    pub identity_pubkey: Pubkey,      // PDA owner identity
    pub encrypted_phone: Vec<u8>,     // AES-256-GCM encrypted blob
    pub created_at: i64,
}

impl TinAccount {
    pub fn space(display_name: &str, encrypted_phone_len: usize) -> usize {
        8 + (4 + display_name.len()) + 32 + (4 + encrypted_phone_len) + 8
    }
}
