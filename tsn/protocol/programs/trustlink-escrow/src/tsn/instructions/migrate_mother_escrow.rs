use anchor_lang::{
    prelude::*,
    solana_program::{program::invoke, system_instruction},
    Discriminator,
};

use crate::tsn::{
    constants::TSN_MOTHER_ESCROW_SEED,
    errors::TsnError,
    events::TsnMotherEscrowInitialized,
    state::MotherEscrow,
    utils::{default_fee_splits, is_valid_split},
};

#[derive(Accounts)]
pub struct MigrateMotherEscrow<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Existing PDA may use an older layout, so it cannot be deserialized yet.
    #[account(mut, seeds = [TSN_MOTHER_ESCROW_SEED], bump)]
    pub mother_escrow: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn migrate_mother_escrow(
    ctx: Context<MigrateMotherEscrow>,
    protocol_seed: [u8; 32],
    epoch_seconds: i64,
    lease_seconds: i64,
    fee_split_cranker_bps: Option<u16>,
    fee_split_lp_bps: Option<u16>,
    fee_split_treasury_bps: Option<u16>,
) -> Result<()> {
    require_keys_eq!(
        *ctx.accounts.mother_escrow.owner,
        crate::ID,
        TsnError::InvalidMotherEscrowAccount
    );

    let (default_cranker, default_lp, default_treasury) = default_fee_splits();
    let cranker_bps = fee_split_cranker_bps.unwrap_or(default_cranker);
    let lp_bps = fee_split_lp_bps.unwrap_or(default_lp);
    let treasury_bps = fee_split_treasury_bps.unwrap_or(default_treasury);

    require!(
        is_valid_split(cranker_bps, lp_bps, treasury_bps),
        TsnError::InvalidFeeSplit
    );

    let rent = Rent::get()?;
    let minimum_balance = rent.minimum_balance(MotherEscrow::SPACE);
    let current_lamports = ctx.accounts.mother_escrow.to_account_info().lamports();
    if current_lamports < minimum_balance {
        invoke(
            &system_instruction::transfer(
                &ctx.accounts.authority.key(),
                &ctx.accounts.mother_escrow.key(),
                minimum_balance - current_lamports,
            ),
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.mother_escrow.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
    }

    ctx.accounts
        .mother_escrow
        .to_account_info()
        .realloc(MotherEscrow::SPACE, true)?;

    let now = Clock::get()?.unix_timestamp;
    let bump = ctx.bumps.mother_escrow;
    let mut data = ctx.accounts.mother_escrow.try_borrow_mut_data()?;
    let mut offset = 0;

        data[offset..offset + 8].copy_from_slice(&MotherEscrow::DISCRIMINATOR);
    offset += 8;
    data[offset..offset + 32].copy_from_slice(ctx.accounts.authority.key().as_ref());
    offset += 32;
    data[offset..offset + 32].copy_from_slice(&protocol_seed);
    offset += 32;
    data[offset..offset + 8].copy_from_slice(&epoch_seconds.to_le_bytes());
    offset += 8;
    data[offset..offset + 8].copy_from_slice(&lease_seconds.to_le_bytes());
    offset += 8;
    data[offset..offset + 2].copy_from_slice(&cranker_bps.to_le_bytes());
    offset += 2;
    data[offset..offset + 2].copy_from_slice(&lp_bps.to_le_bytes());
    offset += 2;
    data[offset..offset + 2].copy_from_slice(&treasury_bps.to_le_bytes());
    offset += 2;
    data[offset..offset + 8].copy_from_slice(&0_u64.to_le_bytes());
    offset += 8;
    data[offset..offset + 8].copy_from_slice(&now.to_le_bytes());
    offset += 8;
    data[offset] = bump;

    emit!(TsnMotherEscrowInitialized {
        mother_escrow: ctx.accounts.mother_escrow.key(),
        authority: ctx.accounts.authority.key(),
        epoch_seconds,
        lease_seconds,
    });

    Ok(())
}
