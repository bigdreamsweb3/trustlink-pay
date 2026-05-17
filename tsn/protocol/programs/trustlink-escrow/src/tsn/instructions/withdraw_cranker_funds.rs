use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::tsn::{
    constants::TSN_CRANKER_VAULT_AUTHORITY_SEED,
    errors::TsnError,
    events::TsnCrankerFundsWithdrawn,
    state::{Cranker, CrankerVault, LiquidityPosition, MotherEscrow},
};

#[derive(Accounts)]
pub struct WithdrawCrankerFunds<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,

    pub mother_escrow: Box<Account<'info, MotherEscrow>>,

    #[account(has_one = mother_escrow)]
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
        constraint = vault_token_account.mint == cranker_vault.token_mint
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = funder_token_account.owner == funder.key(),
        constraint = funder_token_account.mint == cranker_vault.token_mint
    )]
    pub funder_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = liquidity_position.cranker_vault == cranker_vault.key(),
        constraint = liquidity_position.funder == funder.key()
    )]
    pub liquidity_position: Box<Account<'info, LiquidityPosition>>,

    pub token_program: Program<'info, Token>,
}

pub fn withdraw_cranker_funds(ctx: Context<WithdrawCrankerFunds>, amount: u64) -> Result<()> {
    let available = ctx
        .accounts
        .liquidity_position
        .principal_amount
        .saturating_sub(ctx.accounts.liquidity_position.withdrawn_amount);
    require!(amount <= available, TsnError::InsufficientLiquidityPosition);

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
                to: ctx.accounts.funder_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.liquidity_position.withdrawn_amount =
        ctx.accounts.liquidity_position.withdrawn_amount.saturating_add(amount);
    ctx.accounts.liquidity_position.updated_at_ts = now;

    ctx.accounts.cranker_vault.total_liquidity =
        ctx.accounts.cranker_vault.total_liquidity.saturating_sub(amount);
    ctx.accounts.cranker_vault.total_withdrawn =
        ctx.accounts.cranker_vault.total_withdrawn.saturating_add(amount);

    emit!(TsnCrankerFundsWithdrawn {
        cranker: ctx.accounts.cranker.key(),
        cranker_vault: ctx.accounts.cranker_vault.key(),
        funder: ctx.accounts.funder.key(),
        amount,
    });

    Ok(())
}
