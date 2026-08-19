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

/// Public settlement capability.  This is the only payment-specific account
/// that appears in a private payout transaction.  It contains hashes and
/// settlement coordinates, never the underlying escrow account or intent PDA.
#[account]
pub struct PrivateSettlementDna {
    pub mother_escrow: Pubkey,
    pub payment_id_hash: [u8; 32],
    /// SHA-256 digest of the private commitment. The raw commitment is never
    /// put in an instruction, permit, event, or account.
    pub commitment_digest: [u8; 32],
    pub settlement_commitment: [u8; 32],
    pub authorized_cranker: Pubkey,
    pub cranker_vault: Pubkey,
    pub token_mint: Pubkey,
    pub recipient_wallet: Pubkey,
    pub amount: u64,
    pub claim_fee_amount: u64,
    pub lease_id_hash: [u8; 32],
    pub lease_version: u64,
    pub lease_expiry_ts: i64,
    pub expires_at_ts: i64,
    pub random_nonce: [u8; 32],
    pub payout_nullifier: [u8; 32],
    pub consumed: bool,
    pub settlement_cranker: Pubkey,
    pub consumed_at_ts: i64,
    /// Epoch settlement uses this immutable claim to reimburse the exact
    /// vault which fronted the payout.
    pub reimbursement_amount: u64,
    pub reimbursed: bool,
    pub bump: u8,
}

impl PrivateSettlementDna {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 32
        + 8 + 8 + 32 + 8 + 8 + 8 + 32 + 32 + 1 + 32 + 8 + 8 + 1 + 1 + 1;
}
