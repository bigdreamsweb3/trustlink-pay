use anchor_lang::{
    prelude::*,
    system_program::{self, CreateAccount},
    Discriminator,
};

use crate::tsn::{
    constants::{TSN_CRANKER_SEED, TSN_INTENT_SEED, TSN_VERIFIER_SEED},
    errors::TsnError,
    events::TsnIntentCreated,
    state::{Cranker, IntentStatus, MotherEscrow, PaymentIntent},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
#[instruction(intent_id: [u8; 32])]
pub struct CreateIntent<'info> {
    #[account(mut)]
    pub cranker_operator: Signer<'info>,

    pub mother_escrow: Account<'info, MotherEscrow>,

    #[account(
        mut,
        seeds = [TSN_CRANKER_SEED, mother_escrow.key().as_ref(), cranker_operator.key().as_ref()],
        bump,
        constraint = cranker.operator == cranker_operator.key(),
        constraint = cranker.mother_escrow == mother_escrow.key()
    )]
    pub cranker: Account<'info, Cranker>,

    /// CHECK: Protocol SOL reservoir PDA that funds payment-intent account rent.
    #[account(
        mut,
        seeds = [TSN_VERIFIER_SEED],
        bump
    )]
    pub verifier_pda: UncheckedAccount<'info>,

    /// CHECK: Payment intent PDA created inside this instruction with verifier PDA funding.
    #[account(
        mut,
        seeds = [TSN_INTENT_SEED, mother_escrow.key().as_ref(), intent_id.as_ref()],
        bump
    )]
    pub intent: UncheckedAccount<'info>,

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
    require!(
        ctx.accounts.intent.data_is_empty(),
        TsnError::PaymentIntentAlreadyInitialized
    );
    require_keys_eq!(
        *ctx.accounts.verifier_pda.owner,
        system_program::ID,
        TsnError::InvalidVerifierPda
    );

    let expected_dna = compute_cranker_dna(
        &ctx.accounts.mother_escrow.key(),
        &ctx.accounts.cranker_operator.key(),
        &ctx.accounts.mother_escrow.protocol_seed,
    );
    require!(
        ctx.accounts.cranker.dna_hash == expected_dna,
        TsnError::CrankerDnaMismatch
    );

    let intent_space = PaymentIntent::SPACE;
    let intent_rent = Rent::get()?.minimum_balance(intent_space);
    require!(
        ctx.accounts.verifier_pda.lamports() >= intent_rent,
        TsnError::InsufficientVerifierLamports
    );

    let verifier_bump = ctx.bumps.verifier_pda;
    let intent_bump = ctx.bumps.intent;
    let mother_escrow_key = ctx.accounts.mother_escrow.key();
    let verifier_signer: &[&[u8]] = &[TSN_VERIFIER_SEED, &[verifier_bump]];
    let intent_signer: &[&[u8]] = &[
        TSN_INTENT_SEED,
        mother_escrow_key.as_ref(),
        intent_id.as_ref(),
        &[intent_bump],
    ];

    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.verifier_pda.to_account_info(),
                to: ctx.accounts.intent.to_account_info(),
            },
            &[verifier_signer, intent_signer],
        ),
        intent_rent,
        intent_space as u64,
        ctx.program_id,
    )?;

    let now = Clock::get()?.unix_timestamp;
    {
        let mut data = ctx.accounts.intent.try_borrow_mut_data()?;
        data[..8].copy_from_slice(&PaymentIntent::discriminator());
        let intent = PaymentIntent {
            mother_escrow: ctx.accounts.mother_escrow.key(),
            intent_id,
            underlying_payment,
            token_mint,
            amount,
            recipient_hash,
            status: IntentStatus::Pending,
            assigned_cranker: Pubkey::default(),
            lease_expiry_ts: 0,
            proof_submitted: false,
            payout_tx_sig: [0u8; 64],
            created_at_ts: now,
            executed_at_ts: 0,
            settled_epoch_id: 0,
            bump: ctx.bumps.intent,
        };
        let mut cursor = &mut data[8..];
        AnchorSerialize::serialize(&intent, &mut cursor)?;
    }

    ctx.accounts.cranker.claim_credits = ctx
        .accounts
        .cranker
        .claim_credits
        .checked_add(1)
        .ok_or(TsnError::CrankerClaimCreditOverflow)?;
    ctx.accounts.cranker.last_active_ts = now;

    emit!(TsnIntentCreated {
        mother_escrow: ctx.accounts.mother_escrow.key(),
        intent: ctx.accounts.intent.key(),
        intent_id,
        amount,
        token_mint,
    });
    Ok(())
}
