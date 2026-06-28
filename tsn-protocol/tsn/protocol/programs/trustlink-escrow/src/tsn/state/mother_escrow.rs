use anchor_lang::prelude::*;

#[account]
pub struct MotherEscrow {
    pub authority: Pubkey,
    pub tins_program_id: Pubkey,
    pub protocol_seed: [u8; 32],
    pub epoch_seconds: i64,
    pub lease_seconds: i64,
    pub fee_split_cranker_bps: u16,
    pub fee_split_lp_bps: u16,
    pub fee_split_treasury_bps: u16,
    pub tin_fee_split_verify_cranker_bps: u16,
    pub tin_fee_split_submit_cranker_bps: u16,
    pub tin_fee_split_team_bps: u16,
    pub tin_fee_split_reserve_pool_bps: u16,
    pub epoch_id: u64,
    pub last_epoch_settled_ts: i64,
    pub bump: u8,
}

impl MotherEscrow {
    pub const SPACE: usize = 8  // anchor discr
        + 32                    // authority
        + 32                    // tins_program_id
        + 32                    // protocol_seed
        + 8                     // epoch_seconds
        + 8                     // lease_seconds
        + 2 + 2 + 2             // settlement fee splits
        + 2 + 2 + 2 + 2         // tin fee splits
        + 8                     // epoch_id
        + 8                     // last_epoch_settled_ts
        + 1; // bump
}
