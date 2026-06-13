use anchor_lang::{
    prelude::*,
    system_program::{self, Transfer as SystemTransfer},
};
use anchor_spl::token::TokenAccount;

use crate::tsn::{
    constants::{
        TSN_COMMITMENT_RECORD_SEED, TSN_CRANKER_SEED,
        TSN_PAYMENT_INTENT_GAS_REIMBURSEMENT_LAMPORTS,
        TSN_SHARED_ESCROW_AUTHORITY_SEED, TSN_VERIFIER_SEED,
    },
    errors::TsnError,
    events::TsnPrivateCommitmentRegistered,
    state::{CommitmentRecord, Cranker, MotherEscrow},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
#[instruction(commitment_hash: [u8; 32])]
pub struct RegisterPrivateCommitment<'info> {
    #[account(mut)]
    pub cranker_operator: Signer<'info>,

    pub mother_escrow: Box<Account<'info, MotherEscrow>>,

    #[account(
        mut,
        seeds = [
            TSN_CRANKER_SEED,
            mother_escrow.key().as_ref(),
            cranker_operator.key().as_ref()
        ],
        bump = cranker.bump,
        has_one = mother_escrow,
        constraint = cranker.operator == cranker_operator.key()
    )]
    pub cranker: Box<Account<'info, Cranker>>,

    #[account(
        init,
        payer = cranker_operator,
        space = CommitmentRecord::SPACE,
        seeds = [TSN_COMMITMENT_RECORD_SEED, commitment_hash.as_ref()],
        bump
    )]
    pub commitment_record: Account<'info, CommitmentRecord>,

    /// CHECK: Shared authority controls random one-time escrow token accounts.
    #[account(
        seeds = [TSN_SHARED_ESCROW_AUTHORITY_SEED, mother_escrow.key().as_ref()],
        bump
    )]
    pub shared_escrow_authority: UncheckedAccount<'info>,

    #[account(
        constraint = escrow_token_account.owner == shared_escrow_authority.key()
            @ TsnError::InvalidPrivateEscrowTokenAccount
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: System-owned protocol reservoir used to reimburse commitment setup.
    #[account(mut, seeds = [TSN_VERIFIER_SEED], bump)]
    pub verifier_pda: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn register_private_commitment(
    ctx: Context<RegisterPrivateCommitment>,
    commitment_hash: [u8; 32],
    amount: u64,
) -> Result<()> {
    require!(
        commitment_hash != [0; 32] && amount > 0,
        TsnError::InvalidPrivateCommitment
    );
    require!(
        ctx.accounts.escrow_token_account.amount >= amount,
        TsnError::InvalidPaymentVaultFunding
    );
    require_keys_eq!(
        *ctx.accounts.verifier_pda.owner,
        system_program::ID,
        TsnError::InvalidVerifierPda
    );

    let mother_escrow = &ctx.accounts.mother_escrow;
    let expected_dna = compute_cranker_dna(
        &mother_escrow.key(),
        &ctx.accounts.cranker_operator.key(),
        &mother_escrow.protocol_seed,
    );
    require!(
        ctx.accounts.cranker.dna_hash == expected_dna,
        TsnError::CrankerDnaMismatch
    );

    let now = Clock::get()?.unix_timestamp;
    let record = &mut ctx.accounts.commitment_record;
    record.mother_escrow = mother_escrow.key();
    record.commitment_hash = commitment_hash;
    record.token_mint = ctx.accounts.escrow_token_account.mint;
    record.amount = amount;
    record.epoch_id = mother_escrow.epoch_id;
    record.registered_by = ctx.accounts.cranker.key();
    record.created_at_ts = now;
    record.bump = ctx.bumps.commitment_record;

    ctx.accounts.cranker.claim_credits = ctx
        .accounts
        .cranker
        .claim_credits
        .checked_add(1)
        .ok_or(TsnError::CrankerClaimCreditOverflow)?;
    ctx.accounts.cranker.last_active_ts = now;

    let reimbursement = Rent::get()?
        .minimum_balance(CommitmentRecord::SPACE)
        .checked_add(TSN_PAYMENT_INTENT_GAS_REIMBURSEMENT_LAMPORTS)
        .ok_or(TsnError::PaymentIntentFundingOverflow)?;
    require!(
        ctx.accounts.verifier_pda.lamports() >= reimbursement,
        TsnError::InsufficientVerifierLamports
    );
    let verifier_bump = ctx.bumps.verifier_pda;
    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            SystemTransfer {
                from: ctx.accounts.verifier_pda.to_account_info(),
                to: ctx.accounts.cranker_operator.to_account_info(),
            },
            &[&[TSN_VERIFIER_SEED, &[verifier_bump]]],
        ),
        reimbursement,
    )?;

    emit!(TsnPrivateCommitmentRegistered {
        commitment_hash,
        token_mint: record.token_mint,
        amount,
        epoch_id: record.epoch_id,
    });
    Ok(())
}
