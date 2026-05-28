use anchor_lang::prelude::*;

use crate::tsn::{
    constants::TSN_MOTHER_ESCROW_SEED,
    events::TsnMotherEscrowInitialized,
    errors::TsnError,
    state::MotherEscrow,
    utils::{default_fee_splits, is_valid_split},
};

#[derive(Accounts)]
pub struct InitializeMotherEscrow<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = MotherEscrow::SPACE,
        seeds = [TSN_MOTHER_ESCROW_SEED],
        bump
    )]
    pub mother_escrow: Account<'info, MotherEscrow>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_mother_escrow(
    ctx: Context<InitializeMotherEscrow>,
    tins_program_id: Pubkey,
    protocol_seed: [u8; 32],
    epoch_seconds: i64,
    lease_seconds: i64,
    fee_split_cranker_bps: Option<u16>,
    fee_split_lp_bps: Option<u16>,
    fee_split_treasury_bps: Option<u16>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let (default_cranker, default_lp, default_treasury) = default_fee_splits();
    let cranker_bps = fee_split_cranker_bps.unwrap_or(default_cranker);
    let lp_bps = fee_split_lp_bps.unwrap_or(default_lp);
    let treasury_bps = fee_split_treasury_bps.unwrap_or(default_treasury);

    require!(
        is_valid_split(cranker_bps, lp_bps, treasury_bps),
        TsnError::InvalidFeeSplit
    );

    let mother_escrow = &mut ctx.accounts.mother_escrow;
    mother_escrow.authority = ctx.accounts.authority.key();
    mother_escrow.tins_program_id = tins_program_id;
    mother_escrow.protocol_seed = protocol_seed;
    mother_escrow.epoch_seconds = epoch_seconds;
    mother_escrow.lease_seconds = lease_seconds;
    mother_escrow.fee_split_cranker_bps = cranker_bps;
    mother_escrow.fee_split_lp_bps = lp_bps;
    mother_escrow.fee_split_treasury_bps = treasury_bps;
    mother_escrow.epoch_id = 0;
    mother_escrow.last_epoch_settled_ts = now;
    mother_escrow.bump = ctx.bumps.mother_escrow;

    emit!(TsnMotherEscrowInitialized {
        mother_escrow: mother_escrow.key(),
        authority: mother_escrow.authority,
        epoch_seconds,
        lease_seconds,
    });
    Ok(())
}
