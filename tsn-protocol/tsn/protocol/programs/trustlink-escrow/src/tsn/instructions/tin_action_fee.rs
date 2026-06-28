use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::tsn::{
    constants::{TSN_CRANKER_SEED},
    errors::TsnError,
    state::{Cranker, MotherEscrow},
};

#[derive(Accounts)]
pub struct CommitTinActionFee<'info> {
    #[account(mut)]
    pub cranker_operator: Signer<'info>, // Cranker A (Verifier)

    #[account(
        mut,
        constraint = sender_token_account.mint == token_mint.key()
    )]
    pub sender_token_account: Box<Account<'info, TokenAccount>>,

    pub token_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub team_treasury_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub reserve_pool_token_account: Box<Account<'info, TokenAccount>>,

    pub mother_escrow: Box<Account<'info, MotherEscrow>>,

    #[account(
        mut,
        seeds = [
            TSN_CRANKER_SEED,
            mother_escrow.key().as_ref(),
            cranker_operator.key().as_ref()
        ],
        bump = cranker.bump,
        has_one = mother_escrow,
        constraint = cranker.operator == cranker_operator.key()
    )]
    pub cranker: Box<Account<'info, Cranker>>,

    /// CHECK: The submitter cranker B
    pub submitter_cranker_operator: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            TSN_CRANKER_SEED,
            mother_escrow.key().as_ref(),
            submitter_cranker_operator.key().as_ref()
        ],
        bump = submitter_cranker.bump,
        has_one = mother_escrow,
        constraint = submitter_cranker.operator == submitter_cranker_operator.key()
    )]
    pub submitter_cranker: Box<Account<'info, Cranker>>,

    pub token_program: Program<'info, Token>,
}

pub fn commit_tin_action_fee(
    ctx: Context<CommitTinActionFee>,
) -> Result<()> {
    // 0.05 USDC fee = 50,000 micros (assuming 6 decimals)
    let total_fee: u64 = 50_000;
    let team_fee = total_fee * 20 / 100;
    let reserve_fee = total_fee * 10 / 100;
    let submitter_fee = total_fee * 40 / 100;

    // The verifier cranker is the one paying, so they just pay the non-rebated portion
    // 1. Pay Team Treasury
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.sender_token_account.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.team_treasury_token_account.to_account_info(),
                authority: ctx.accounts.cranker_operator.to_account_info(),
            },
        ),
        team_fee,
        ctx.accounts.token_mint.decimals,
    )?;

    // 2. Pay Reserve Pool
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.sender_token_account.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.reserve_pool_token_account.to_account_info(),
                authority: ctx.accounts.cranker_operator.to_account_info(),
            },
        ),
        reserve_fee,
        ctx.accounts.token_mint.decimals,
    )?;

    // 3. For the submitter, we just give them a claim_credit
    // since they will execute the action on TINS.
    ctx.accounts.submitter_cranker.claim_credits = ctx
        .accounts
        .submitter_cranker
        .claim_credits
        .checked_add(1)
        .ok_or(TsnError::CrankerClaimCreditOverflow)?;

    Ok(())
}
