use anchor_lang::prelude::*;

#[account]
pub struct EpochAccount {
    pub mother_escrow: Pubkey,
    pub epoch_id: u64,
    pub token_mint: Pubkey,
    pub pea: Pubkey,
    pub aggregate_root_hash: [u8; 32],
    pub total_to_distribute: u64,
    pub cranker_credit_sum_mod: u64,
    pub committed_at_ts: i64,
    pub first_recovery_cranker: Pubkey,
    pub recovery_processed: bool,
    pub residual_swept: bool,
    pub bump: u8,
}

impl EpochAccount {
    pub const SPACE: usize = 8 + 32 + 8 + 32 + 32 + 32 + 8 + 8 + 8 + 32 + 1 + 1 + 1;
}

#[account]
pub struct PaymentCommitment {
    pub epoch_account: Pubkey,
    pub commitment_hash: [u8; 32],
    pub amount: u64,
    pub nullifier_hash: [u8; 32],
    pub tin_route_hash: [u8; 32],
    pub cranker_lease: Pubkey,
    pub expiry_ts: i64,
    pub reimbursed: bool,
    pub bump: u8,
}

impl PaymentCommitment {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 32 + 32 + 32 + 8 + 1 + 1;
}

#[account]
pub struct PrivacyReceivePda {
    pub mother_escrow: Pubkey,
    pub tin_route_hash: [u8; 32],
    pub owner_commitment: [u8; 32],
    pub active: bool,
    pub bump: u8,
}

impl PrivacyReceivePda {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1 + 1;
}
