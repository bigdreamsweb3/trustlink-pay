use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::tsn::{
    constants::{BPS_DENOMINATOR, TSN_CRANKER_VAULT_AUTHORITY_SEED, TSN_SPLIT_BPS_RECOVERY_BONUS},
    errors::TsnError,
    events::TsnProofSubmitted,
    state::{Cranker, CrankerVault, IntentStatus, MotherEscrow, PaymentIntent},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
pub struct SubmitProof<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    pub mother_escrow: Box<Account<'info, MotherEscrow>>,

    #[account(mut, has_one = mother_escrow)]
    pub intent: Box<Account<'info, PaymentIntent>>,

    #[account(
        mut,
        has_one = mother_escrow,
        constraint = cranker.operator == operator.key()
    )]
    pub cranker: Box<Account<'info, Cranker>>,

    #[account(
        mut,
        has_one = mother_escrow,
        constraint = cranker_vault.cranker == cranker.key(),
        constraint = cranker_vault.token_mint == intent.token_mint,
        constraint = cranker_vault.vault_token_account == vault_token_account.key()
    )]
    pub cranker_vault: Box<Account<'info, CrankerVault>>,

    /// CHECK: PDA authority for the vault token account.
    #[account(
        seeds = [TSN_CRANKER_VAULT_AUTHORITY_SEED, cranker_vault.key().as_ref()],
        bump = cranker_vault.vault_authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = vault_token_account.mint == intent.token_mint
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = operator_token_account.owner == operator.key(),
        constraint = operator_token_account.mint == intent.token_mint
    )]
    pub operator_token_account: Box<Account<'info, TokenAccount>>,

    /// Treasury token account for protocol revenue.
    #[account(
        mut,
        constraint = treasury_token_account.mint == intent.token_mint
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = reserve_pool_token_account.mint == intent.token_mint
    )]
    pub reserve_pool_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = recipient_token_account.mint == intent.token_mint
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn submit_proof(ctx: Context<SubmitProof>, payout_tx_sig: [u8; 64], payout_amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let mother_escrow = &ctx.accounts.mother_escrow;
    let operator = ctx.accounts.operator.key();

    let expected_dna = compute_cranker_dna(&mother_escrow.key(), &operator, &mother_escrow.protocol_seed);
    require!(ctx.accounts.cranker.dna_hash == expected_dna, TsnError::CrankerDnaMismatch);

    let intent = &mut ctx.accounts.intent;
    require!(intent.status == IntentStatus::Claimed, TsnError::IntentNotClaimable);
    require!(now <= intent.lease_expiry_ts, TsnError::LeaseExpired);
    require!(
        intent.assigned_cranker == ctx.accounts.cranker.key(),
        TsnError::NotAssignedCranker
    );
    require!(!intent.proof_submitted, TsnError::ProofAlreadySubmitted);
    require!(payout_amount <= intent.amount, TsnError::InvalidPayoutAmount);
    require!(
        ctx.accounts.cranker_vault.reserved_liquidity >= intent.amount,
        TsnError::InvalidLiquidityReservation
    );

    let fee_amount = intent.amount.saturating_sub(payout_amount);
    let operator_fee_amount = split_fee_floor(fee_amount, mother_escrow.fee_split_cranker_bps)?;
    let treasury_fee_amount = split_fee_floor(fee_amount, mother_escrow.fee_split_treasury_bps)?;
    let reserve_fee_amount = split_fee_floor(fee_amount, TSN_SPLIT_BPS_RECOVERY_BONUS)?;
    let external_fee_amount = operator_fee_amount
        .checked_add(treasury_fee_amount)
        .and_then(|value| value.checked_add(reserve_fee_amount))
        .ok_or(TsnError::FeeSplitOverflow)?;
    let lp_fee_amount = fee_amount
        .checked_sub(external_fee_amount)
        .ok_or(TsnError::InvalidFeeSplit)?;

    let cranker_vault_key = ctx.accounts.cranker_vault.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        TSN_CRANKER_VAULT_AUTHORITY_SEED,
        cranker_vault_key.as_ref(),
        &[ctx.accounts.cranker_vault.vault_authority_bump],
    ]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        payout_amount,
    )?;

    transfer_from_vault(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.vault_token_account.to_account_info(),
        ctx.accounts.operator_token_account.to_account_info(),
        ctx.accounts.vault_authority.to_account_info(),
        signer_seeds,
        operator_fee_amount,
    )?;
    transfer_from_vault(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.vault_token_account.to_account_info(),
        ctx.accounts.treasury_token_account.to_account_info(),
        ctx.accounts.vault_authority.to_account_info(),
        signer_seeds,
        treasury_fee_amount,
    )?;
    transfer_from_vault(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.vault_token_account.to_account_info(),
        ctx.accounts.reserve_pool_token_account.to_account_info(),
        ctx.accounts.vault_authority.to_account_info(),
        signer_seeds,
        reserve_fee_amount,
    )?;

    let total_debit = payout_amount
        .checked_add(external_fee_amount)
        .ok_or(TsnError::FeeSplitOverflow)?;
    ctx.accounts.cranker_vault.total_liquidity = ctx
        .accounts
        .cranker_vault
        .total_liquidity
        .checked_sub(total_debit)
        .ok_or(TsnError::InsufficientCrankerVaultLiquidity)?;
    ctx.accounts.cranker_vault.reserved_liquidity = ctx
        .accounts
        .cranker_vault
        .reserved_liquidity
        .checked_sub(intent.amount)
        .ok_or(TsnError::InvalidLiquidityReservation)?;
    ctx.accounts.cranker_vault.total_rewards_accrued = ctx
        .accounts
        .cranker_vault
        .total_rewards_accrued
        .saturating_add(lp_fee_amount);

    intent.payout_tx_sig = payout_tx_sig;
    intent.proof_submitted = true;
    intent.status = IntentStatus::Executed;
    intent.executed_at_ts = now;

    ctx.accounts.cranker.total_executes = ctx.accounts.cranker.total_executes.saturating_add(1);
    ctx.accounts.cranker.last_active_ts = now;

    emit!(TsnProofSubmitted {
        intent: intent.key(),
        cranker: ctx.accounts.cranker.key(),
        payout_amount,
        fee_amount,
        operator_fee_amount,
        lp_fee_amount,
        treasury_fee_amount,
    });
    Ok(())
}

fn split_fee_floor(amount: u64, bps: u16) -> Result<u64> {
    amount
        .checked_mul(bps as u64)
        .and_then(|value| value.checked_div(BPS_DENOMINATOR))
        .ok_or(TsnError::FeeSplitOverflow.into())
}

fn transfer_from_vault<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token::transfer(
        CpiContext::new_with_signer(
            token_program,
            Transfer {
                from,
                to,
                authority,
            },
            signer_seeds,
        ),
        amount,
    )
}
