use anchor_lang::prelude::*;

use crate::tsn::{errors::TsnError, events::TsnLeaseExpired, state::{IntentStatus, MotherEscrow, PaymentIntent}};

#[derive(Accounts)]
pub struct ReassignIntent<'info> {
    pub mother_escrow: Account<'info, MotherEscrow>,

    #[account(mut, has_one = mother_escrow)]
    pub intent: Account<'info, PaymentIntent>,
}

pub fn reassign_intent(ctx: Context<ReassignIntent>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let intent = &mut ctx.accounts.intent;

    require!(intent.status == IntentStatus::Claimed, TsnError::IntentNotClaimable);
    require!(now > intent.lease_expiry_ts, TsnError::LeaseStillActive);

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
