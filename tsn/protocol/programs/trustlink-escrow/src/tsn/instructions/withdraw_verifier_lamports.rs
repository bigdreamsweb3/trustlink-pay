use anchor_lang::{
    prelude::*,
    system_program::{self, Transfer},
};

use crate::tsn::{
    constants::TSN_VERIFIER_SEED,
    errors::TsnError,
    state::MotherEscrow,
};

#[derive(Accounts)]
pub struct WithdrawVerifierLamports<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(has_one = authority)]
    pub mother_escrow: Account<'info, MotherEscrow>,

    /// CHECK: Protocol SOL reservoir PDA.
    #[account(
        mut,
        seeds = [TSN_VERIFIER_SEED],
        bump
    )]
    pub verifier_pda: UncheckedAccount<'info>,

    /// CHECK: Destination wallet receiving SOL from verifier PDA.
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn withdraw_verifier_lamports(
    ctx: Context<WithdrawVerifierLamports>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, TsnError::InvalidPayoutAmount);
    require!(
        ctx.accounts.verifier_pda.lamports() >= amount,
        TsnError::InsufficientVerifierLamports
    );

    let verifier_bump = ctx.bumps.verifier_pda;
    let verifier_signer: &[&[u8]] = &[TSN_VERIFIER_SEED, &[verifier_bump]];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.verifier_pda.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
            },
            &[verifier_signer],
        ),
        amount,
    )?;

    Ok(())
}
