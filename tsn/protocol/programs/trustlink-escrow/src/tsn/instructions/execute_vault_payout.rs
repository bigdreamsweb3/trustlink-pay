use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::tsn::{
    constants::TSN_CRANKER_VAULT_AUTHORITY_SEED,
    errors::TsnError,
    state::{Cranker, CrankerVault, MotherEscrow},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
pub struct ExecuteVaultPayout<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    pub mother_escrow: Box<Account<'info, MotherEscrow>>,

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
        constraint = vault_token_account.mint == cranker_vault.token_mint,
        constraint = vault_token_account.owner == vault_authority.key() @ TsnError::InvalidCrankerVaultAuthority
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = recipient_token_account.mint == cranker_vault.token_mint
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn execute_vault_payout(
    ctx: Context<ExecuteVaultPayout>,
    payout_amount: u64,
    claim_fee_amount: u64,
) -> Result<()> {
    require!(payout_amount > 0, TsnError::InvalidPayoutAmount);
    require!(
        ctx.accounts.cranker_vault.total_liquidity >= payout_amount,
        TsnError::InsufficientCrankerVaultLiquidity
    );

    let mother_escrow = &ctx.accounts.mother_escrow;
    let operator = ctx.accounts.operator.key();
    let expected_dna = compute_cranker_dna(&mother_escrow.key(), &operator, &mother_escrow.protocol_seed);
    require!(ctx.accounts.cranker.dna_hash == expected_dna, TsnError::CrankerDnaMismatch);

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

    ctx.accounts.cranker_vault.total_liquidity =
        ctx.accounts.cranker_vault.total_liquidity.saturating_sub(payout_amount);
    ctx.accounts.cranker_vault.total_rewards_accrued = ctx
        .accounts
        .cranker_vault
        .total_rewards_accrued
        .saturating_add(claim_fee_amount);

    ctx.accounts.cranker.total_executes = ctx.accounts.cranker.total_executes.saturating_add(1);
    ctx.accounts.cranker.last_active_ts = Clock::get()?.unix_timestamp;

    Ok(())
}
