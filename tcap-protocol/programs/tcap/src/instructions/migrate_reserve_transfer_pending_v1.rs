use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

use crate::authority::{TCAP_GLOBAL_CONFIG_SEED, TCAP_ASSET_ENTRY_SEED};
use crate::error::TcapError;
use crate::state::{TcapAssetEntryV1, TcapGlobalConfigV1, TcapReserveStateV1};

/// Appends the Path 2 transfer_pending counter to an existing reserve account.
/// This is deliberately raw-data and governance gated so old reserves can be
/// upgraded before Anchor attempts to deserialize the enlarged account.
#[derive(Accounts)]
pub struct MigrateReserveTransferPendingV1<'info> {
    #[account(mut, address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()], bump = asset_entry.bump)]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    /// CHECK: validated by owner, discriminator, and canonical reserve PDA relationship.
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)]
    pub reserve_state: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigrateReserveTransferPendingV1>) -> Result<()> {
    let reserve = &ctx.accounts.reserve_state;
    require_keys_eq!(*reserve.owner, crate::ID, TcapError::InvalidPda);
    let old_len = TcapReserveStateV1::SPACE - 8;
    require!(reserve.data_len() == old_len, TcapError::InvalidPda);
    let data = reserve.try_borrow_data()?;
    require!(data[..8] == TcapReserveStateV1::DISCRIMINATOR, TcapError::InvalidPda);
    // Existing layout stores asset_entry at offset 44 and reserve authority at 108.
    let asset_entry = Pubkey::try_from(&data[44..76]).map_err(|_| error!(TcapError::InvalidPda))?;
    let reserve_authority = Pubkey::try_from(&data[108..140]).map_err(|_| error!(TcapError::InvalidPda))?;
    drop(data);
    require!(reserve_authority != Pubkey::default(), TcapError::InvalidReserve);
    reserve.to_account_info().realloc(TcapReserveStateV1::SPACE, true)?;
    let mut out = reserve.try_borrow_mut_data()?;
    out[old_len..TcapReserveStateV1::SPACE].fill(0);
    Ok(())
}
