use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::tsn::{
    constants::{TSN_CRANKER_SEED, TSN_PAYMENT_VAULT_SEED},
    errors::TsnError,
    events::TsnPaymentIntentValidated,
    state::{Cranker, MotherEscrow, VaultSettlementStatus, VaultState},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
#[instruction(payment_intent_id: u64)]
pub struct FinalizePaymentIntent<'info> {
    pub cranker_operator: Signer<'info>,

    pub mother_escrow: Account<'info, MotherEscrow>,

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
    pub cranker: Account<'info, Cranker>,

    #[account(
        mut,
        seeds = [TSN_PAYMENT_VAULT_SEED, payment_intent_id.to_le_bytes().as_ref()],
        bump = payment_vault.bump,
        constraint = payment_vault.payment_intent_id == payment_intent_id
    )]
    pub payment_vault: Account<'info, VaultState>,

    #[account(
        constraint = payment_vault_token_account.owner == payment_vault.key()
            @ TsnError::InvalidUniqueTokenAccount
    )]
    pub payment_vault_token_account: Account<'info, TokenAccount>,
}

pub fn finalize_payment_intent(
    ctx: Context<FinalizePaymentIntent>,
    _payment_intent_id: u64,
    authorized_amount: u64,
) -> Result<()> {
    require!(authorized_amount > 0, TsnError::InvalidPayoutAmount);
    require!(
        ctx.accounts.payment_vault.status == VaultSettlementStatus::Created,
        TsnError::InvalidVaultSettlementState
    );
    require!(
        ctx.accounts.payment_vault_token_account.amount >= authorized_amount,
        TsnError::InvalidPaymentVaultFunding
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

    ctx.accounts.payment_vault.status = VaultSettlementStatus::Escrowed;
    ctx.accounts.cranker.claim_credits = ctx
        .accounts
        .cranker
        .claim_credits
        .checked_add(1)
        .ok_or(TsnError::CrankerClaimCreditOverflow)?;
    ctx.accounts.cranker.last_active_ts = Clock::get()?.unix_timestamp;

    emit!(TsnPaymentIntentValidated {
        vault: ctx.accounts.payment_vault.key(),
        cranker: ctx.accounts.cranker.key(),
        amount: authorized_amount,
        claim_credits: ctx.accounts.cranker.claim_credits,
    });
    Ok(())
}
