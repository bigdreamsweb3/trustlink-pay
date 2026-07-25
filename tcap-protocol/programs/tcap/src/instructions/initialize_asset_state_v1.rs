use anchor_lang::prelude::*;
use anchor_spl::token::{Token, ID as SPL_TOKEN_PROGRAM_ID};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::authority::*;
use crate::error::TcapError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct InitializeAssetStateV1<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [TCAP_GLOBAL_CONFIG_SEED],
        bump = config.bump,
        constraint = !config.paused @ TcapError::ProtocolPaused
    )]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = payer,
        space = TcapAssetStateV1::SPACE,
        seeds = [TCAP_ASSET_STATE_SEED, token_program.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub asset_state: Box<Account<'info, TcapAssetStateV1>>,
    #[account(
        init,
        payer = payer,
        space = TcapReserveStateV1::SPACE,
        seeds = [TCAP_RESERVE_STATE_SEED, asset_state.key().as_ref()],
        bump
    )]
    pub reserve_state: Box<Account<'info, TcapReserveStateV1>>,
    /// CHECK: PDA metadata only; used as the vault authority.
    #[account(
        seeds = [TCAP_RESERVE_AUTHORITY_SEED, asset_state.key().as_ref()],
        bump
    )]
    pub reserve_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        seeds = [TCAP_FUTURE_VAULT_SEED, asset_state.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = reserve_authority,
        token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeAssetStateV1>) -> Result<()> {
    require_keys_eq!(
        *ctx.accounts.mint.to_account_info().owner,
        ctx.accounts.token_program.key(),
        TcapError::InvalidTokenProgram
    );
    // For this deployment, support SPL Token only
    require_keys_eq!(
        ctx.accounts.token_program.key(),
        SPL_TOKEN_PROGRAM_ID,
        TcapError::InvalidTokenProgram
    );

    let state = &mut ctx.accounts.asset_state;
    state.version = TCAP_STATE_VERSION_V1;
    state.protocol_version = ctx.accounts.config.protocol_version;
    state.config = ctx.accounts.config.key();
    state.asset = TcapMintBindingV1 {
        token_program: ctx.accounts.token_program.key(),
        mint: ctx.accounts.mint.key(),
    };
    state.reserve_state = ctx.accounts.reserve_state.key();
    state.future_vault = ctx.accounts.vault.key();
    state.reserve_authority = ctx.accounts.reserve_authority.key();
    state.decimals = ctx.accounts.mint.decimals;
    state.bump = ctx.bumps.asset_state;

    let reserve = &mut ctx.accounts.reserve_state;
    reserve.version = TCAP_STATE_VERSION_V1;
    reserve.protocol_version = ctx.accounts.config.protocol_version;
    reserve.asset_state = state.key();
    reserve.future_vault = state.future_vault;
    reserve.reserve_authority = state.reserve_authority;
    reserve.actual_assets = 0;
    reserve.pending_liabilities = 0;
    reserve.settled_confidential_liabilities = 0;
    reserve.authorized_withdrawal_liabilities = 0;
    reserve.reserved_refund_liabilities = 0;
    reserve.accounting_epoch = 0;
    reserve.funding_enabled = true; // Always enabled in permissionless model
    reserve.paused = false;
    reserve.bump = ctx.bumps.reserve_state;
    reserve.reserve_authority_bump = ctx.bumps.reserve_authority;
    reserve.future_vault_bump = ctx.bumps.vault;

    emit!(AssetStateInitializedV1 {
        asset_state: state.key(),
        reserve_state: reserve.key(),
        mint: state.asset.mint,
        token_program: state.asset.token_program,
    });
    
    emit!(ReserveVaultInitializedV1 {
        version: TCAP_INSTRUCTION_VERSION_V1,
        asset_entry: state.key(), // emitted as asset_entry to not break existing clients
        reserve_state: reserve.key(),
        mint: state.asset.mint,
        vault: state.future_vault,
    });

    Ok(())
}
