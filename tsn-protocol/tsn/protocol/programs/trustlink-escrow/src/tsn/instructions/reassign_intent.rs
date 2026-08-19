use anchor_lang::prelude::*;

use crate::tsn::{errors::TsnError, events::TsnLeaseExpired, state::{CrankerVault, IntentStatus, MotherEscrow, PaymentIntent}};

#[derive(Accounts)]
pub struct ReassignIntent<'info> {
    pub mother_escrow: Account<'info, MotherEscrow>,

    #[account(mut, has_one = mother_escrow)]
    pub intent: Account<'info, PaymentIntent>,

    #[account(
        mut,
        has_one = mother_escrow,
        constraint = cranker_vault.cranker == intent.assigned_cranker,
        constraint = cranker_vault.token_mint == intent.token_mint
    )]
    pub cranker_vault: Account<'info, CrankerVault>,
}

pub fn reassign_intent(ctx: Context<ReassignIntent>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let intent = &mut ctx.accounts.intent;

    require!(intent.status == IntentStatus::Claimed, TsnError::IntentNotClaimable);
    require!(now > intent.lease_expiry_ts, TsnError::LeaseStillActive);
    ctx.accounts.cranker_vault.reserved_liquidity = ctx
        .accounts
        .cranker_vault
        .reserved_liquidity
        .checked_sub(intent.amount)
        .ok_or(TsnError::InvalidLiquidityReservation)?;

    let previous_cranker = intent.assigned_cranker;
    intent.status = IntentStatus::Pending;
    intent.assigned_cranker = Pubkey::default();
    intent.lease_expiry_ts = 0;

    emit!(TsnLeaseExpired {
        intent: intent.key(),
        previous_cranker,
    });
    Ok(())
}
