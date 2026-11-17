use anchor_lang::prelude::*;
use crate::{authority::{TCAP_FUNDING_ROOT_SEED, TCAP_GLOBAL_CONFIG_SEED}, error::TcapError,
    private_funding::{migrate_legacy_funding_root, TcapFundingMerkleRootV1}, state::TcapGlobalConfigV1};

/// Explicit one-time in-place upgrade. Runtime accounts never decode the old layout.
#[derive(Accounts)]
pub struct MigratePrivateFundingRootV2<'info> {
    #[account(mut, address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    /// CHECK: canonical PDA above; owner and exact old layout checked before reallocating.
    #[account(mut, seeds = [TCAP_FUNDING_ROOT_SEED], bump)]
    pub funding_root: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigratePrivateFundingRootV2>) -> Result<()> {
    let account = &ctx.accounts.funding_root;
    require_keys_eq!(*account.owner, crate::ID, TcapError::InvalidFundingRoot);
    require!(ctx.accounts.config.protocol_version == 1, TcapError::InvalidFundingRoot);
    let migrated = migrate_legacy_funding_root(&account.try_borrow_data()?, ctx.bumps.funding_root)?;
    let required = Rent::get()?.minimum_balance(TcapFundingMerkleRootV1::SPACE);
    let top_up = required.saturating_sub(account.lamports());
    if top_up > 0 {
        anchor_lang::system_program::transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer { from: ctx.accounts.governance.to_account_info(), to: account.to_account_info() }), top_up)?;
    }
    account.to_account_info().realloc(TcapFundingMerkleRootV1::SPACE, true)?;
    migrated.try_serialize(&mut &mut account.try_borrow_mut_data()?[..])?;
    Ok(())
}
