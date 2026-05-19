use anchor_lang::prelude::*;

use crate::tsn::{errors::TsnError, events::TsnEpochSettled, state::MotherEscrow};

#[derive(Accounts)]
pub struct SettleEpoch<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub mother_escrow: Account<'info, MotherEscrow>,
}

pub fn settle_epoch(ctx: Context<SettleEpoch>, force: bool) -> Result<()> {
    require!(
        ctx.accounts.mother_escrow.authority == ctx.accounts.authority.key(),
        TsnError::Unauthorized
    );

    let now = Clock::get()?.unix_timestamp;
    let mother_escrow = &mut ctx.accounts.mother_escrow;
    let elapsed = now.saturating_sub(mother_escrow.last_epoch_settled_ts);
    require!(
        force || elapsed >= mother_escrow.epoch_seconds,
        TsnError::EpochNotReady
    );

    mother_escrow.epoch_id = mother_escrow.epoch_id.saturating_add(1);
    mother_escrow.last_epoch_settled_ts = now;

    emit!(TsnEpochSettled {
        mother_escrow: mother_escrow.key(),
        epoch_id: mother_escrow.epoch_id,
    });
    Ok(())
}
