use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self,TokenAccount,TokenInterface,Mint,TransferChecked};
use crate::{authority::{TCAP_GLOBAL_CONFIG_SEED,TCAP_RESERVE_AUTHORITY_SEED},error::TcapError,state::{TcapGlobalConfigV1,TcapReserveStateV1,TcapAssetEntryV1,TcapExitPermitV1}};
use anchor_lang::solana_program::hash::hashv;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct PayoutTcapExitArgsV1 { pub destination_owner: Pubkey }

#[derive(Accounts)]
pub struct PayoutTcapExitV1<'info> {
    pub authority: Signer<'info>,
    #[account(seeds=[TCAP_GLOBAL_CONFIG_SEED],bump=config.bump)] pub config: Account<'info,TcapGlobalConfigV1>,
    #[account(mut)] pub reserve_state: Account<'info,TcapReserveStateV1>,
    #[account(seeds=[crate::authority::TCAP_ASSET_ENTRY_SEED,asset_entry.registry.as_ref(),asset_entry.asset.token_program.as_ref(),asset_entry.asset.mint.as_ref()],bump=asset_entry.bump)] pub asset_entry: Account<'info,TcapAssetEntryV1>,
    #[account(mut, constraint=!permit.consumed @ TcapError::NullifierAlreadyConsumed)] pub permit: Account<'info,TcapExitPermitV1>,
    #[account(seeds=[TCAP_RESERVE_AUTHORITY_SEED,asset_entry.key().as_ref()],bump=reserve_state.reserve_authority_bump, constraint=reserve_state.asset_entry==asset_entry.key() @ TcapError::InvalidReserve)] pub reserve_authority: UncheckedAccount<'info>,
    #[account(mut,address=asset_entry.future_vault @ TcapError::ReserveVaultUnavailable)] pub vault: InterfaceAccount<'info,TokenAccount>,
    #[account(mut, constraint=destination.mint==asset_entry.asset.mint @ TcapError::WrongAsset)] pub destination: InterfaceAccount<'info,TokenAccount>,
    #[account(address=asset_entry.asset.mint @ TcapError::WrongAsset)] pub mint: InterfaceAccount<'info,Mint>,
    pub token_program: Interface<'info,TokenInterface>,
}

pub fn handler(ctx: Context<PayoutTcapExitV1>, args: PayoutTcapExitArgsV1) -> Result<()> {
    let commitment = hashv(&[b"TCAP_EXIT_COMMIT_V1", args.destination_owner.as_ref(), ctx.accounts.destination.key().as_ref(), &ctx.accounts.permit.amount.to_le_bytes(), ctx.accounts.permit.mint.as_ref(), &ctx.accounts.permit.nonce, ctx.accounts.permit.tip.as_ref(), &ctx.accounts.permit.sequence.to_le_bytes()]).to_bytes();
    require!(commitment == ctx.accounts.permit.destination_commitment, TcapError::InvalidTipAuthorization);
    require!(ctx.accounts.permit.mint == ctx.accounts.asset_entry.asset.mint, TcapError::WrongAsset);
    require!(ctx.accounts.vault.amount>=ctx.accounts.permit.amount,TcapError::InvalidReserveLiability);
    let amount=ctx.accounts.permit.amount; let decimals=ctx.accounts.mint.decimals;
    token_interface::transfer_checked(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(),TransferChecked{from:ctx.accounts.vault.to_account_info(),mint:ctx.accounts.mint.to_account_info(),to:ctx.accounts.destination.to_account_info(),authority:ctx.accounts.reserve_authority.to_account_info()},&[&[TCAP_RESERVE_AUTHORITY_SEED,ctx.accounts.asset_entry.key().as_ref(),&[ctx.accounts.reserve_state.reserve_authority_bump]]]),amount,decimals)?;
    ctx.accounts.reserve_state.actual_assets=ctx.accounts.vault.amount.checked_sub(amount).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.permit.consumed=true; Ok(())
}
