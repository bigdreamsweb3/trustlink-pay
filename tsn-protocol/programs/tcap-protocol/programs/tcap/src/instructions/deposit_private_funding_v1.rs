use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

use crate::authority::*;
use crate::error::TcapError;
use crate::events::PrivateFundingDepositedV1;
use crate::private_funding::{append_funded_leaf,funded_leaf,TcapFundingMerkleRootV1,FUNDING_TREE_CAPACITY,BN254_MODULUS};
use crate::state::*;

#[derive(Accounts)]
pub struct DepositPrivateFundingV1<'info> {
    pub depositor: Signer<'info>,
    #[account(
        seeds = [TCAP_GLOBAL_CONFIG_SEED],
        bump = config.bump,
        constraint = !config.paused @ TcapError::ProtocolPaused
    )]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(
        seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump,
        constraint = asset_entry.asset.token_program == token_program.key() @ TcapError::InvalidTokenProgram,
        constraint = asset_entry.asset.mint == mint.key() @ TcapError::WrongAsset,
        constraint = asset_entry.deposits_enabled @ TcapError::AssetUnavailable,
        constraint = !asset_entry.paused @ TcapError::AssetUnavailable,
        constraint = !asset_entry.deprecated @ TcapError::AssetUnavailable,
        constraint = asset_entry.status == TcapAssetStatusV1::Active @ TcapError::AssetUnavailable,
        constraint = asset_entry.risk_state == TcapRiskStateV1::Approved @ TcapError::AssetUnavailable,
    )]
    pub asset_entry: Box<Account<'info, TcapAssetEntryV1>>,
    #[account(
        mut,
        address = asset_entry.reserve_state @ TcapError::InvalidReserve,
        constraint = reserve_state.asset_entry == asset_entry.key() @ TcapError::InvalidReserve,
        constraint = reserve_state.future_vault == vault.key() @ TcapError::InvalidReserve,
        constraint = reserve_state.reserve_authority == asset_entry.reserve_authority @ TcapError::InvalidReserve,
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
        address = asset_entry.future_vault @ TcapError::ReserveVaultUnavailable,
        constraint = vault.mint == mint.key() @ TcapError::WrongAsset,
        constraint = vault.owner == asset_entry.reserve_authority @ TcapError::InvalidReserve
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = asset_entry.asset.mint @ TcapError::WrongAsset)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = asset_entry.asset.token_program @ TcapError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
    #[account(mut,seeds=[TCAP_FUNDING_ROOT_SEED],bump=funding_root.bump)]
    pub funding_root: Box<Account<'info,TcapFundingMerkleRootV1>>,
}

pub fn handler(ctx: Context<DepositPrivateFundingV1>, amount: u64, note_commitment: [u8;32]) -> Result<()> {
    require!(amount > 0, TcapError::InvalidDepositAmount);
    ctx.accounts.funding_root.validate()?;
    require!(ctx.accounts.funding_root.leaf_count < FUNDING_TREE_CAPACITY,TcapError::InvalidFundingRoot);
    require!(note_commitment != [0;32] && note_commitment < BN254_MODULUS && ctx.accounts.asset_entry.token_id > 0,TcapError::FundingCommitmentMismatch);
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
    ctx.accounts.reserve_state.pending_liabilities = ctx
        .accounts
        .reserve_state
        .pending_liabilities
        .checked_add(amount)
        .ok_or(TcapError::ArithmeticOverflow)?;

    // The leaf binds TCAP's registered token and the observed exact transfer delta.
    let actual_amount=ctx.accounts.vault.amount.checked_sub(vault_before).ok_or(TcapError::UnexpectedTokenBalanceDelta)?;
    require!(actual_amount == amount,TcapError::UnexpectedTokenBalanceDelta);
    let leaf=funded_leaf(&note_commitment,ctx.accounts.asset_entry.token_id,actual_amount)?;
    let index=append_funded_leaf(&mut ctx.accounts.funding_root,leaf)?;
    emit!(PrivateFundingDepositedV1 {
        funding_root:ctx.accounts.funding_root.key(),leaf_index:u64::from(index),note_commitment,
        token_id:ctx.accounts.asset_entry.token_id,amount:actual_amount,funded_leaf:leaf,
        root:ctx.accounts.funding_root.current_root,
    });
    Ok(())
}
