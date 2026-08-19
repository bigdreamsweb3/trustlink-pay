use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::tsn::{
    constants::{TSN_CRANKER_VAULT_AUTHORITY_SEED, TSN_CRANKER_VAULT_SEED},
    events::TsnCrankerVaultInitialized,
    state::{Cranker, CrankerVault, MotherEscrow},
};

#[derive(Accounts)]
pub struct InitializeCrankerVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub mother_escrow: Box<Account<'info, MotherEscrow>>,

    #[account(has_one = mother_escrow)]
    pub cranker: Box<Account<'info, Cranker>>,

    pub token_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = payer,
        space = CrankerVault::SPACE,
        seeds = [TSN_CRANKER_VAULT_SEED, cranker.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub cranker_vault: Box<Account<'info, CrankerVault>>,

    /// CHECK: PDA authority for the vault token account.
    #[account(
        seeds = [TSN_CRANKER_VAULT_AUTHORITY_SEED, cranker_vault.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        token::mint = token_mint,
        token::authority = vault_authority,
        seeds = [b"tsn_cranker_vault_token", cranker_vault.key().as_ref()],
        bump
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_cranker_vault(ctx: Context<InitializeCrankerVault>) -> Result<()> {
    let cranker_vault = &mut ctx.accounts.cranker_vault;
    cranker_vault.mother_escrow = ctx.accounts.mother_escrow.key();
    cranker_vault.cranker = ctx.accounts.cranker.key();
    cranker_vault.token_mint = ctx.accounts.token_mint.key();
    cranker_vault.vault_token_account = ctx.accounts.vault_token_account.key();
    cranker_vault.vault_authority_bump = ctx.bumps.vault_authority;
    cranker_vault.total_liquidity = 0;
    cranker_vault.total_shares = 0;
    cranker_vault.reserved_liquidity = 0;
    cranker_vault.total_withdrawn = 0;
    cranker_vault.total_rewards_accrued = 0;
    cranker_vault.bump = ctx.bumps.cranker_vault;

    emit!(TsnCrankerVaultInitialized {
        cranker: ctx.accounts.cranker.key(),
        cranker_vault: cranker_vault.key(),
        token_mint: ctx.accounts.token_mint.key(),
        vault_token_account: ctx.accounts.vault_token_account.key(),
    });

    Ok(())
}
