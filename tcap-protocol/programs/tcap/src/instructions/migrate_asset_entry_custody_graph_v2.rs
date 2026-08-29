use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::asset_governance::{require_v2_instruction_enabled, TcapAssetGovernancePolicyV2};
use crate::authority::{
    TCAP_ASSET_ENTRY_SEED, TCAP_ASSET_GOVERNANCE_POLICY_SEED, TCAP_ASSET_STATE_SEED,
    TCAP_GLOBAL_CONFIG_SEED,
};
use crate::error::TcapError;
use crate::state::{TcapAssetEntryV1, TcapAssetStateV1, TcapGlobalConfigV1, TcapReserveStateV1};

#[derive(Accounts)]
pub struct MigrateAssetEntryCustodyGraphV2<'info> {
    #[account(mut, address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(
        mut,
        seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump,
    )]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(
        seeds = [TCAP_ASSET_GOVERNANCE_POLICY_SEED, asset_entry.key().as_ref()],
        bump = governance_policy.bump,
        constraint = governance_policy.asset_entry == asset_entry.key() @ TcapError::InvalidAssetPolicy,
    )]
    pub governance_policy: Account<'info, TcapAssetGovernancePolicyV2>,
    #[account(
        seeds = [TCAP_ASSET_STATE_SEED, token_program.key().as_ref(), mint.key().as_ref()],
        bump = asset_state.bump,
        constraint = asset_state.config == config.key() @ TcapError::InvalidAssetPolicy,
        constraint = asset_state.asset.token_program == token_program.key() @ TcapError::InvalidTokenProgram,
        constraint = asset_state.asset.mint == mint.key() @ TcapError::WrongAsset,
    )]
    pub asset_state: Account<'info, TcapAssetStateV1>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)]
    pub previous_reserve_state: Account<'info, TcapReserveStateV1>,
    #[account(
        address = asset_entry.future_vault @ TcapError::ReserveVaultUnavailable,
        constraint = previous_vault.mint == mint.key() @ TcapError::WrongAsset,
        constraint = previous_vault.owner == asset_entry.reserve_authority @ TcapError::InvalidReserve,
    )]
    pub previous_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        address = asset_state.reserve_state @ TcapError::InvalidReserve,
        constraint = target_reserve_state.asset_state == asset_state.key() @ TcapError::InvalidReserve,
        constraint = target_reserve_state.future_vault == asset_state.future_vault @ TcapError::InvalidReserve,
        constraint = target_reserve_state.reserve_authority == asset_state.reserve_authority @ TcapError::InvalidReserve,
    )]
    pub target_reserve_state: Account<'info, TcapReserveStateV1>,
    #[account(
        address = asset_state.future_vault @ TcapError::ReserveVaultUnavailable,
        constraint = target_vault.mint == mint.key() @ TcapError::WrongAsset,
        constraint = target_vault.owner == asset_state.reserve_authority @ TcapError::InvalidReserve,
    )]
    pub target_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(address = asset_entry.asset.mint @ TcapError::WrongAsset)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(address = asset_entry.asset.token_program @ TcapError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<MigrateAssetEntryCustodyGraphV2>) -> Result<()> {
    require_v2_instruction_enabled(&ctx.accounts.config)?;
    require!(ctx.accounts.previous_reserve_state.total_liabilities() == Some(0), TcapError::InvalidReserveLiability);
    require!(ctx.accounts.previous_reserve_state.actual_assets == 0, TcapError::InvalidReserveLiability);
    require!(ctx.accounts.previous_vault.amount == 0, TcapError::InvalidReserveLiability);
    require!(ctx.accounts.target_reserve_state.actual_assets == ctx.accounts.target_vault.amount, TcapError::InvalidReserve);
    require!(ctx.accounts.target_reserve_state.actual_assets >= ctx.accounts.target_reserve_state.total_liabilities().ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidReserveLiability);

    let entry = &mut ctx.accounts.asset_entry;
    entry.reserve_state = ctx.accounts.asset_state.reserve_state;
    entry.future_vault = ctx.accounts.asset_state.future_vault;
    entry.reserve_authority = ctx.accounts.asset_state.reserve_authority;
    Ok(())
}
