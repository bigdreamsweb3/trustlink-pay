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
pub struct CommitmentRecord {
    pub mother_escrow: Pubkey,
    pub commitment_hash: [u8; 32],
    pub token_mint: Pubkey,
    pub amount: u64,
    pub epoch_id: u64,
    pub registered_by: Pubkey,
    pub created_at_ts: i64,
    pub bump: u8,
}

impl CommitmentRecord {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 8 + 8 + 32 + 8 + 1;
}

#[account]
pub struct SpentNullifier {
    pub mother_escrow: Pubkey,
    pub nullifier: [u8; 32],
    pub operator: Pubkey,
    pub action: u8,
    pub used_at_ts: i64,
    pub bump: u8,
}

impl SpentNullifier {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1 + 8 + 1;
    pub const ACTION_PAYOUT: u8 = 1;
    pub const ACTION_RECOVERY: u8 = 2;
}
