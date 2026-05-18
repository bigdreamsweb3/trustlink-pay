use anchor_lang::prelude::*;

#[account]
pub struct Cranker {
    pub mother_escrow: Pubkey,
    pub operator: Pubkey,
    pub dna_hash: [u8; 32],
    pub allow_external_funding: bool,
    pub staked_amount: u64,
    pub reputation_score: u32,
    pub claim_credits: u64,
    pub total_claims: u64,
    pub total_executes: u64,
    pub total_failures: u64,
    pub last_active_ts: i64,
    pub bump: u8,
}

impl Cranker {
    pub const SPACE: usize = 8
        + 32
        + 32
        + 32
        + 1
        + 8
        + 4
        + 8
        + 8
        + 8
        + 8
        + 8
        + 1;
}
