use anchor_lang::prelude::*;

#[account]
pub struct PrivateSettlementConfig {
    pub mother_escrow: Pubkey,
    pub authority: Pubkey,
    pub permit_signer: Pubkey,
    pub enabled: bool,
    pub bump: u8,
}

impl PrivateSettlementConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1 + 1;
}

#[account]
pub struct PrivateReplayRegistry {
    pub mother_escrow: Pubkey,
    pub next_payout_sequence: u64,
    pub next_recovery_sequence: u64,
    pub bump: u8,
}

impl PrivateReplayRegistry {
    pub const SPACE: usize = 8 + 32 + 8 + 8 + 1;
}
