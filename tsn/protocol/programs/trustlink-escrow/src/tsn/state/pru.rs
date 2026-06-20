use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PrivacyLevel {
    Level1,
    Level2,
    Level3,
    Level4,
}

impl PrivacyLevel {
    pub fn pru_count(self) -> u16 {
        match self {
            PrivacyLevel::Level1 => 3,
            PrivacyLevel::Level2 => 10,
            PrivacyLevel::Level3 => 30,
            PrivacyLevel::Level4 => 100,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PruLifecycleState {
    Planned,
    Active,
    Used,
    Swept,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TsnBalanceState {
    Available,
    Pending,
    Settled,
}

#[account]
pub struct TinIdentity {
    pub tin_id: u64,
    pub owner: Pubkey,
    pub privacy_level: PrivacyLevel,
    pub encryption_metadata_hash: [u8; 32],
    pub pru_configuration_hash: [u8; 32],
    pub bump: u8,
}

impl TinIdentity {
    pub const SPACE: usize = 8 + 8 + 32 + 1 + 32 + 32 + 1;
}

#[account]
pub struct PruMetadata {
    pub tin_id: u64,
    pub token_mint: Pubkey,
    pub index: u16,
    pub derived_public_key: Pubkey,
    pub encrypted_metadata_hash: [u8; 32],
    pub state: PruLifecycleState,
    pub bump: u8,
}

impl PruMetadata {
    pub const SPACE: usize = 8 + 8 + 32 + 2 + 32 + 32 + 1 + 1;
}
