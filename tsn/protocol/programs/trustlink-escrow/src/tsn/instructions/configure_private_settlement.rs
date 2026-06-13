use anchor_lang::prelude::*;

use crate::tsn::{
    constants::TSN_PRIVATE_SETTLEMENT_CONFIG_SEED,
    errors::TsnError,
    events::TsnPrivateSettlementConfigured,
    state::{MotherEscrow, PrivateSettlementConfig},
};

#[derive(Accounts)]
pub struct ConfigurePrivateSettlement<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(has_one = authority)]
    pub mother_escrow: Account<'info, MotherEscrow>,

    #[account(
        init_if_needed,
        payer = authority,
        space = PrivateSettlementConfig::SPACE,
        seeds = [TSN_PRIVATE_SETTLEMENT_CONFIG_SEED, mother_escrow.key().as_ref()],
        bump
    )]
    pub private_settlement_config: Account<'info, PrivateSettlementConfig>,

    pub system_program: Program<'info, System>,
}

pub fn configure_private_settlement(
    ctx: Context<ConfigurePrivateSettlement>,
    permit_signer: Pubkey,
    enabled: bool,
) -> Result<()> {
    require!(
        permit_signer != Pubkey::default(),
        TsnError::InvalidPermitSigner
    );
    let config = &mut ctx.accounts.private_settlement_config;
    config.mother_escrow = ctx.accounts.mother_escrow.key();
    config.authority = ctx.accounts.authority.key();
    config.permit_signer = permit_signer;
    config.enabled = enabled;
    config.bump = ctx.bumps.private_settlement_config;

    emit!(TsnPrivateSettlementConfigured {
        mother_escrow: config.mother_escrow,
        permit_signer,
        enabled,
    });
    Ok(())
}
