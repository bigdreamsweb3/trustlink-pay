use anchor_lang::prelude::*;

use crate::authority::{derive_tcap_tip_liability_v2, TCAP_ASSET_ENTRY_SEED, TCAP_GLOBAL_CONFIG_SEED, TCAP_TIP_LIABILITY_V2_SEED, TCAP_TIN_TIP_V1_SEED};
use crate::error::TcapError;
use crate::state::{TCapTinTipV1, TcapAssetEntryV1, TcapGlobalConfigV1, TcapTipLiabilityV2};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct InitializeTcapTipLiabilityV2Args {
    pub initial_available: u64,
}

#[derive(Accounts)]
pub struct InitializeTcapTipLiabilityV2<'info> {
    #[account(mut, address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub authority: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(seeds = [TCAP_TIN_TIP_V1_SEED, tip_root.key().as_ref()], bump = tin_tip.bump)]
    pub tin_tip: Account<'info, TCapTinTipV1>,
    /// CHECK: blinded root used only to derive the opaque tip PDA.
    pub tip_root: UncheckedAccount<'info>,
    #[account(seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()], bump = asset_entry.bump)]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)]
    pub reserve_state: Account<'info, crate::state::TcapReserveStateV1>,
    #[account(init, payer = authority, space = TcapTipLiabilityV2::SPACE, seeds = [TCAP_TIP_LIABILITY_V2_SEED, tin_tip.key().as_ref(), asset_entry.key().as_ref()], bump)]
    pub liability: Account<'info, TcapTipLiabilityV2>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeTcapTipLiabilityV2>, args: InitializeTcapTipLiabilityV2Args) -> Result<()> {
    require!(args.initial_available > 0, TcapError::InvalidDepositAmount);
    require!(ctx.accounts.reserve_state.actual_assets >= ctx.accounts.reserve_state.settled_confidential_liabilities.checked_add(args.initial_available).ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidReserveLiability);
    let liability = &mut ctx.accounts.liability;
    liability.version = 2;
    liability.tip = ctx.accounts.tin_tip.key();
    liability.asset_entry = ctx.accounts.asset_entry.key();
    liability.available = args.initial_available;
    liability.spent = 0;
    liability.bump = ctx.bumps.liability;
    ctx.accounts.reserve_state.settled_confidential_liabilities = ctx.accounts.reserve_state.settled_confidential_liabilities.checked_add(args.initial_available).ok_or(TcapError::ArithmeticOverflow)?;
    let (expected, _) = derive_tcap_tip_liability_v2(&liability.tip, &liability.asset_entry);
    require_keys_eq!(expected, liability.key(), TcapError::InvalidTipLiability);
    Ok(())
}
