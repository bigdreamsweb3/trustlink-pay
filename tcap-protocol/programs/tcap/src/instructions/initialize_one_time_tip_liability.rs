use anchor_lang::prelude::*;
use crate::authority::{TCAP_ASSET_ENTRY_SEED, TCAP_GLOBAL_CONFIG_SEED, TCAP_TIP_LIABILITY_V2_SEED};
use crate::error::TcapError;
use crate::state::{TcapAssetEntryV1, TcapGlobalConfigV1, TcapOneTimeTip, TcapReserveStateV1, TcapTipLiabilityV2};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct InitializeOneTimeTipLiabilityArgs { pub initial_available: u64 }

#[derive(Accounts)]
pub struct InitializeOneTimeTipLiability<'info> {
    #[account(mut, address = config.governance_authority @ TcapError::InvalidAuthority)] pub authority: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)] pub config: Account<'info, TcapGlobalConfigV1>,
    pub one_time_tip: Account<'info, TcapOneTimeTip>,
    #[account(seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()], bump = asset_entry.bump)] pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)] pub reserve_state: Account<'info, TcapReserveStateV1>,
    #[account(init, payer = authority, space = TcapTipLiabilityV2::SPACE, seeds = [TCAP_TIP_LIABILITY_V2_SEED, one_time_tip.key().as_ref(), asset_entry.key().as_ref()], bump)] pub liability: Account<'info, TcapTipLiabilityV2>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeOneTimeTipLiability>, args: InitializeOneTimeTipLiabilityArgs) -> Result<()> {
    require!(ctx.accounts.reserve_state.actual_assets >= ctx.accounts.reserve_state.settled_confidential_liabilities.checked_add(args.initial_available).ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidReserveLiability);
    let l = &mut ctx.accounts.liability;
    l.version = 2; l.tip = ctx.accounts.one_time_tip.key(); l.asset_entry = ctx.accounts.asset_entry.key(); l.available = args.initial_available; l.spent = 0; l.bump = ctx.bumps.liability;
    ctx.accounts.reserve_state.settled_confidential_liabilities = ctx.accounts.reserve_state.settled_confidential_liabilities.checked_add(args.initial_available).ok_or(TcapError::ArithmeticOverflow)?;
    Ok(())
}
