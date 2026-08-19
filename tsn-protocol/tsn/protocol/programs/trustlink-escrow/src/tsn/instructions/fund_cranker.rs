use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::tsn::{
    constants::TSN_LIQUIDITY_POSITION_SEED,
    errors::TsnError,
    events::TsnCrankerFunded,
    state::{Cranker, CrankerVault, LiquidityPosition, MotherEscrow},
};

#[derive(Accounts)]
pub struct FundCranker<'info> {
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

    #[account(
        mut,
        constraint = funder_token_account.owner == funder.key(),
        constraint = funder_token_account.mint == cranker_vault.token_mint
    )]
    pub funder_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = vault_token_account.mint == cranker_vault.token_mint
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = funder,
        space = LiquidityPosition::SPACE,
        seeds = [TSN_LIQUIDITY_POSITION_SEED, cranker_vault.key().as_ref(), funder.key().as_ref()],
        bump
    )]
    pub liquidity_position: Box<Account<'info, LiquidityPosition>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn fund_cranker(ctx: Context<FundCranker>, amount: u64) -> Result<()> {
    require!(
        ctx.accounts.cranker.allow_external_funding
            || ctx.accounts.cranker.operator == ctx.accounts.funder.key(),
        TsnError::ExternalFundingDisabled
    );

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.funder_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        ),
        amount,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let position = &mut ctx.accounts.liquidity_position;
    if position.funder == Pubkey::default() {
        position.cranker_vault = ctx.accounts.cranker_vault.key();
        position.funder = ctx.accounts.funder.key();
        position.principal_amount = 0;
        position.withdrawn_amount = 0;
        position.reward_amount = 0;
        position.created_at_ts = now;
        position.bump = ctx.bumps.liquidity_position;
    }

    // Deposits mint LP shares at the current asset/share price. Existing
    // deposits therefore participate pro-rata in both gains and losses.
    let cranker_vault = &mut ctx.accounts.cranker_vault;
    let minted_shares = if cranker_vault.total_shares == 0 {
        require!(cranker_vault.total_liquidity == 0, TsnError::InvalidLiquidityShareAmount);
        amount
    } else if cranker_vault.total_liquidity == 0 {
        return Err(TsnError::InvalidLiquidityShareAmount.into());
    } else {
        ((amount as u128)
            .checked_mul(cranker_vault.total_shares as u128)
            .ok_or(TsnError::FeeSplitOverflow)?
            / cranker_vault.total_liquidity as u128) as u64
    };
    require!(minted_shares > 0, TsnError::InvalidLiquidityShareAmount);

    position.principal_amount = position
        .principal_amount
        .checked_add(minted_shares)
        .ok_or(TsnError::FeeSplitOverflow)?;
    position.updated_at_ts = now;

    cranker_vault.total_liquidity = cranker_vault
        .total_liquidity
        .checked_add(amount)
        .ok_or(TsnError::FeeSplitOverflow)?;
    cranker_vault.total_shares = cranker_vault
        .total_shares
        .checked_add(minted_shares)
        .ok_or(TsnError::FeeSplitOverflow)?;

    emit!(TsnCrankerFunded {
        cranker: ctx.accounts.cranker.key(),
        cranker_vault: cranker_vault.key(),
        funder: ctx.accounts.funder.key(),
        amount,
    });

    Ok(())
}
