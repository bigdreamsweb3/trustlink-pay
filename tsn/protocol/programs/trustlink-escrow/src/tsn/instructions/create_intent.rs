use anchor_lang::prelude::*;

use crate::tsn::{
    constants::TSN_INTENT_SEED,
    events::TsnIntentCreated,
    state::{IntentStatus, MotherEscrow, PaymentIntent},
};

#[derive(Accounts)]
#[instruction(intent_id: [u8; 32])]
pub struct CreateIntent<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub mother_escrow: Account<'info, MotherEscrow>,

    #[account(
        init,
        payer = payer,
        space = PaymentIntent::SPACE,
        seeds = [TSN_INTENT_SEED, mother_escrow.key().as_ref(), intent_id.as_ref()],
        bump
    )]
    pub intent: Account<'info, PaymentIntent>,

    pub system_program: Program<'info, System>,
}

pub fn create_intent(
    ctx: Context<CreateIntent>,
    intent_id: [u8; 32],
    underlying_payment: Pubkey,
    token_mint: Pubkey,
    amount: u64,
    recipient_hash: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let intent = &mut ctx.accounts.intent;

    intent.mother_escrow = ctx.accounts.mother_escrow.key();
    intent.intent_id = intent_id;
    intent.underlying_payment = underlying_payment;
    intent.token_mint = token_mint;
    intent.amount = amount;
    intent.recipient_hash = recipient_hash;
    intent.status = IntentStatus::Pending;
    intent.assigned_cranker = Pubkey::default();
    intent.lease_expiry_ts = 0;
    intent.proof_submitted = false;
    intent.payout_tx_sig = [0u8; 64];
    intent.created_at_ts = now;
    intent.executed_at_ts = 0;
    intent.settled_epoch_id = 0;
    intent.bump = ctx.bumps.intent;

    emit!(TsnIntentCreated {
        mother_escrow: ctx.accounts.mother_escrow.key(),
        intent: intent.key(),
        intent_id,
        amount,
        token_mint,
    });
    Ok(())
}
