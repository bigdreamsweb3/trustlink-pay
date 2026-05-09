use anchor_lang::prelude::*;

use crate::tsn::{
    constants::TSN_CRANKER_SEED,
    errors::TsnError,
    events::TsnCrankerRegistered,
    state::{Cranker, MotherEscrow},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
pub struct RegisterCranker<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    pub mother_escrow: Account<'info, MotherEscrow>,

    #[account(
        init,
        payer = operator,
        space = Cranker::SPACE,
        seeds = [TSN_CRANKER_SEED, mother_escrow.key().as_ref(), operator.key().as_ref()],
        bump
    )]
    pub cranker: Account<'info, Cranker>,

    pub system_program: Program<'info, System>,
}

pub fn register_cranker(ctx: Context<RegisterCranker>) -> Result<()> {
    let mother_escrow = &ctx.accounts.mother_escrow;
    let operator = ctx.accounts.operator.key();

    let dna_hash = compute_cranker_dna(&mother_escrow.key(), &operator, &mother_escrow.protocol_seed);

    let cranker = &mut ctx.accounts.cranker;
    cranker.mother_escrow = mother_escrow.key();
    cranker.operator = operator;
    cranker.dna_hash = dna_hash;
    cranker.allow_external_funding = true;
    cranker.staked_amount = 0;
    cranker.reputation_score = 0;
    cranker.total_claims = 0;
    cranker.total_executes = 0;
    cranker.total_failures = 0;
    cranker.last_active_ts = Clock::get()?.unix_timestamp;
    cranker.bump = ctx.bumps.cranker;

    // Defense-in-depth: ensure we didn't compute something unexpected.
    require!(cranker.dna_hash == dna_hash, TsnError::CrankerDnaMismatch);

    emit!(TsnCrankerRegistered {
        mother_escrow: mother_escrow.key(),
        cranker: cranker.key(),
        operator,
    });
    Ok(())
}
