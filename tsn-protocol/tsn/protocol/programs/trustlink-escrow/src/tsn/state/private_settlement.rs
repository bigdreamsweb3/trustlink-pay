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

/// Immutable provenance for a random, shared-authority escrow token account.
/// Recovery is allowed only after this exact escrow has funded a recorded
/// payout, and only back to the vault that performed that payout.
#[account]
pub struct PrivateEscrowRecord {
    pub mother_escrow: Pubkey,
    pub escrow_token_account: Pubkey,
    pub token_mint: Pubkey,
    pub payment_id_hash: [u8; 32],
    pub commitment_hash: [u8; 32],
    pub amount: u64,
    pub settlement_cranker: Pubkey,
    pub payout_nullifier: [u8; 32],
    pub paid: bool,
    pub recovered: bool,
    pub bump: u8,
}

impl PrivateEscrowRecord {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 8 + 32 + 32 + 1 + 1 + 1;
}
