use anchor_lang::prelude::*;

use crate::tsn::{
    errors::TsnError,
    events::TsnCrankerFundingPolicyUpdated,
    state::{Cranker, MotherEscrow},
};

#[derive(Accounts)]
pub struct SetCrankerFundingPolicy<'info> {
    pub operator: Signer<'info>,

    pub mother_escrow: Account<'info, MotherEscrow>,

    #[account(
        mut,
        has_one = mother_escrow,
        constraint = cranker.operator == operator.key()
    )]
    pub cranker: Account<'info, Cranker>,
}

pub fn set_cranker_funding_policy(
    ctx: Context<SetCrankerFundingPolicy>,
    allow_external_funding: bool,
) -> Result<()> {
    require!(
        ctx.accounts.cranker.operator == ctx.accounts.operator.key(),
        TsnError::Unauthorized
    );

    ctx.accounts.cranker.allow_external_funding = allow_external_funding;

    emit!(TsnCrankerFundingPolicyUpdated {
        cranker: ctx.accounts.cranker.key(),
        operator: ctx.accounts.operator.key(),
        allow_external_funding,
    });

    Ok(())
}
