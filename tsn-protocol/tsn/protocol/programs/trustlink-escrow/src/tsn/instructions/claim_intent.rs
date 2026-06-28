use anchor_lang::prelude::*;

use crate::tsn::{
    errors::TsnError,
    events::TsnLeaseClaimed,
    state::{Cranker, IntentStatus, MotherEscrow, PaymentIntent},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
pub struct ClaimIntent<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    pub mother_escrow: Account<'info, MotherEscrow>,

    #[account(mut, has_one = mother_escrow)]
    pub intent: Account<'info, PaymentIntent>,

    #[account(
        mut,
        has_one = mother_escrow,
        constraint = cranker.operator == operator.key()
    )]
    pub cranker: Account<'info, Cranker>,
}

pub fn claim_intent(ctx: Context<ClaimIntent>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let mother_escrow = &ctx.accounts.mother_escrow;
    let operator = ctx.accounts.operator.key();

    // Verify "Cranker DNA" before granting any lease rights.
    let expected_dna = compute_cranker_dna(&mother_escrow.key(), &operator, &mother_escrow.protocol_seed);
    require!(ctx.accounts.cranker.dna_hash == expected_dna, TsnError::CrankerDnaMismatch);

    let intent = &mut ctx.accounts.intent;
    require!(intent.status == IntentStatus::Pending, TsnError::IntentNotPending);
    require!(
        ctx.accounts.cranker.claim_credits > 0,
        TsnError::InsufficientCrankerClaimCredits
    );

    intent.status = IntentStatus::Claimed;
    intent.assigned_cranker = ctx.accounts.cranker.key();
    intent.lease_expiry_ts = now
        .checked_add(mother_escrow.lease_seconds)
        .ok_or(TsnError::IntentNotClaimable)?;

    ctx.accounts.cranker.claim_credits = ctx.accounts.cranker.claim_credits.saturating_sub(1);
    ctx.accounts.cranker.total_claims = ctx.accounts.cranker.total_claims.saturating_add(1);
    ctx.accounts.cranker.last_active_ts = now;

    emit!(TsnLeaseClaimed {
        intent: intent.key(),
        cranker: ctx.accounts.cranker.key(),
        lease_expiry_ts: intent.lease_expiry_ts,
    });
    Ok(())
}
