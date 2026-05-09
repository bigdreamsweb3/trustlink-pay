use anchor_lang::prelude::*;

#[account]
pub struct CrankerVault {
    pub mother_escrow: Pubkey,
    pub cranker: Pubkey,
    pub token_mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub vault_authority_bump: u8,
    pub total_liquidity: u64,
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
        + 1;
}

#[account]
pub struct LiquidityPosition {
    pub cranker_vault: Pubkey,
    pub funder: Pubkey,
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
