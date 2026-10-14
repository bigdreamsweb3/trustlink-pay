use anchor_lang::prelude::*;
use crate::authority::{TCAP_ASSET_ENTRY_SEED, TCAP_GLOBAL_CONFIG_SEED, TCAP_TIP_LIABILITY_V2_SEED};
use crate::error::TcapError;
use crate::state::{TcapAssetEntryV1, TcapGlobalConfigV1, TcapOneTimeTip, TcapReserveStateV1, TcapTipLiabilityV2};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct InitializeOneTimeTipLiabilityArgs { pub initial_available: u64 }

#[derive(Accounts)]
pub struct InitializeOneTimeTipLiability<'info> {
    /// The Cranker or another caller funds only this empty PDA; credit remains
    /// gated by the TSN authorization signer in `credit_one_time_tip`.
    #[account(mut)] pub payer: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)] pub config: Account<'info, TcapGlobalConfigV1>,
    pub one_time_tip: Account<'info, TcapOneTimeTip>,
    #[account(
        seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump,
        constraint = matches!(asset_entry.status, crate::state::TcapAssetStatusV1::Active) && matches!(asset_entry.risk_state, crate::state::TcapRiskStateV1::Approved) @ TcapError::AssetUnavailable,
        constraint = !asset_entry.paused && !asset_entry.deprecated @ TcapError::AssetUnavailable,
        constraint = one_time_tip.token_id == asset_entry.token_id @ TcapError::AssetUnavailable,
    )] pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)] pub reserve_state: Account<'info, TcapReserveStateV1>,
    #[account(init, payer = payer, space = TcapTipLiabilityV2::SPACE, seeds = [TCAP_TIP_LIABILITY_V2_SEED, one_time_tip.key().as_ref(), asset_entry.key().as_ref()], bump)] pub liability: Account<'info, TcapTipLiabilityV2>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeOneTimeTipLiability>, args: InitializeOneTimeTipLiabilityArgs) -> Result<()> {
    // Initialization creates an empty accounting slot only. Funds enter the
    // liability exclusively through the TSN-authorized credit instruction.
    require!(args.initial_available == 0, TcapError::InvalidDepositAmount);
    let l = &mut ctx.accounts.liability;
    l.version = 2; l.tip = ctx.accounts.one_time_tip.key(); l.asset_entry = ctx.accounts.asset_entry.key(); l.available = args.initial_available; l.spent = 0; l.bump = ctx.bumps.liability;
    Ok(())
}
