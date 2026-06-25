use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PrivacyLevel {
    Level1,
    Level2,
    Level3,
    Level4,
}

pub const DEFAULT_PRU_COUNT: u16 = 30;
pub const PRU_ATA_RENT_SUBSIDY_LIMIT: u8 = 3;

impl PrivacyLevel {
    pub fn pru_count(self) -> u16 {
        DEFAULT_PRU_COUNT
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
    pub index: u16,
    pub derived_public_key: Pubkey,
    pub encrypted_metadata_hash: [u8; 32],
    pub state: PruLifecycleState,
    pub bump: u8,
}

impl PruMetadata {
    pub const SPACE: usize = 8 + 8 + 2 + 32 + 32 + 1 + 1;
}

#[account]
pub struct PruLifecycle {
    pub tin_id: u64,
    pub token_mint: Pubkey,
    pub index: u16,
    pub state: PruLifecycleState,
    pub balance_state: TsnBalanceState,
    pub ata_created: bool,
    pub ata_rent_subsidies_used: u8,
    pub last_tx_hash: [u8; 32],
    pub bump: u8,
}

impl PruLifecycle {
    pub const SPACE: usize = 8 + 8 + 32 + 2 + 1 + 1 + 1 + 1 + 32 + 1;
}
