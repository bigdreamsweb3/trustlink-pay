use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

use crate::authority::*;
use crate::error::TcapError;
use crate::events::AssetDepositAcceptedV2;
use crate::state::*;

#[derive(Accounts)]
pub struct DepositAssetV2<'info> {
    pub depositor: Signer<'info>,
    #[account(
        seeds = [TCAP_GLOBAL_CONFIG_SEED],
        bump = config.bump,
        constraint = !config.paused @ TcapError::ProtocolPaused
    )]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(
        seeds = [TCAP_ASSET_STATE_SEED, token_program.key().as_ref(), mint.key().as_ref()],
        bump = asset_state.bump,
        constraint = asset_state.asset.token_program == token_program.key() @ TcapError::InvalidTokenProgram,
        constraint = asset_state.asset.mint == mint.key() @ TcapError::WrongAsset
    )]
    pub asset_state: Box<Account<'info, TcapAssetStateV1>>,
    #[account(
        mut,
        address = asset_state.reserve_state @ TcapError::InvalidReserve,
        constraint = reserve_state.asset_state == asset_state.key() @ TcapError::InvalidReserve,
        constraint = reserve_state.future_vault == vault.key() @ TcapError::InvalidReserve,
        constraint = reserve_state.reserve_authority == asset_state.reserve_authority @ TcapError::InvalidReserve,
        constraint = reserve_state.funding_enabled @ TcapError::AssetUnavailable,
        constraint = !reserve_state.paused @ TcapError::AssetUnavailable
    )]
    pub reserve_state: Box<Account<'info, TcapReserveStateV1>>,
    #[account(
        mut,
        constraint = source.mint == mint.key() @ TcapError::WrongAsset,
        constraint = source.owner == depositor.key() @ TcapError::InvalidDepositSource
    )]
    pub source: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        address = asset_state.future_vault @ TcapError::ReserveVaultUnavailable,
        constraint = vault.mint == mint.key() @ TcapError::WrongAsset,
        constraint = vault.owner == asset_state.reserve_authority @ TcapError::InvalidReserve
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = asset_state.asset.mint @ TcapError::WrongAsset)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = asset_state.asset.token_program @ TcapError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<DepositAssetV2>, amount: u64) -> Result<()> {
    require!(amount > 0, TcapError::InvalidDepositAmount);
    require_keys_eq!(
        *ctx.accounts.source.to_account_info().owner,
        ctx.accounts.token_program.key(),
        TcapError::InvalidTokenProgram
    );
    require_keys_eq!(
        *ctx.accounts.vault.to_account_info().owner,
        ctx.accounts.token_program.key(),
        TcapError::InvalidTokenProgram
    );
    let vault_before = ctx.accounts.vault.amount;
    require!(
        ctx.accounts.reserve_state.actual_assets == vault_before,
        TcapError::InvalidReserve
    );

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_interface::TransferChecked {
                from: ctx.accounts.source.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;
    ctx.accounts.vault.reload()?;
    let expected_vault_after = vault_before
        .checked_add(amount)
        .ok_or(TcapError::ArithmeticOverflow)?;
    require!(
        ctx.accounts.vault.amount == expected_vault_after,
        TcapError::UnexpectedTokenBalanceDelta
    );
    ctx.accounts.reserve_state.actual_assets = ctx.accounts.vault.amount;

    emit!(AssetDepositAcceptedV2 {
        version: crate::TCAP_INSTRUCTION_VERSION_V1,
        registry: Pubkey::default(),
        asset_entry: ctx.accounts.asset_state.key(),
        governance_policy: Pubkey::default(),
        extension_policy: Pubkey::default(),
        reserve_state: ctx.accounts.reserve_state.key(),
        token_program: ctx.accounts.token_program.key(),
        mint: ctx.accounts.mint.key(),
        vault: ctx.accounts.vault.key(),
        source: ctx.accounts.source.key(),
        depositor: ctx.accounts.depositor.key(),
        amount,
        actual_assets: ctx.accounts.reserve_state.actual_assets,
        accounting_epoch: ctx.accounts.reserve_state.accounting_epoch,
        slot: Clock::get()?.slot,
    });
    Ok(())
}
