use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq)]
pub enum VaultSettlementStatus {
    Created,
    Escrowed,
    Leased,
    Paid,
    Recovering,
    Recovered,
}

#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub payment_intent_id: u64,
    pub transfer_id: [u8; 32],
    pub commitment_hash: [u8; 32],
    pub otdt_hash: [u8; 32],
    pub lease_cranker: Pubkey,
    pub settlement_cranker: Pubkey,
    pub lease_expiry_ts: i64,
    pub created_at_ts: i64,
    pub paid_at_ts: i64,
    pub recovered_at_ts: i64,
    pub epoch_id: u64,
    pub status: VaultSettlementStatus,
    pub otdt_used: bool,
    pub recoverable: bool,
    pub bump: u8,
    /// Amount reserved in the originating CrankerVault while this settlement
    /// is leased. Appended for forward-compatible account decoding.
    pub reserved_amount: u64,
}

#[account]
pub struct CrankerVault {
    pub mother_escrow: Pubkey,
    pub cranker: Pubkey,
    pub token_mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub vault_authority_bump: u8,
    /// Actual token assets held by the vault (mirrors the token account).
    pub total_liquidity: u64,
    /// LP share supply. LiquidityPosition::principal_amount stores shares,
    /// not an independent redemption promise.
    pub total_shares: u64,
    /// Assets committed to active settlement leases and therefore not
    /// withdrawable by LPs.
    pub reserved_liquidity: u64,
    pub total_withdrawn: u64,
    pub total_rewards_accrued: u64,
    pub bump: u8,
}

impl CrankerVault {
    pub const SPACE: usize = 8
        + 32
        + 32
        + 32
        + 32
        + 1
        + 8
        + 8
        + 8
        + 8
        + 8
        + 1;
}

#[account]
pub struct LiquidityPosition {
    pub cranker_vault: Pubkey,
    pub funder: Pubkey,
    /// LP shares minted on deposit. Kept at the existing offset for account
    /// compatibility; it is no longer an independent principal claim.
    pub principal_amount: u64,
    pub withdrawn_amount: u64,
    pub reward_amount: u64,
    pub created_at_ts: i64,
    pub updated_at_ts: i64,
    pub bump: u8,
}

impl LiquidityPosition {
    pub const SPACE: usize = 8
        + 32
        + 32
        + 8
        + 8
        + 8
        + 8
        + 8
        + 1;
}
