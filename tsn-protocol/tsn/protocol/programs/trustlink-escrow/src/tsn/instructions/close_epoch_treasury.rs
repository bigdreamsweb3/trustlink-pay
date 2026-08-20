use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount};
use crate::tsn::{constants::TSN_EPOCH_TREASURY_AUTHORITY_SEED, errors::TsnError, state::{EpochSettlementLedger, EpochTreasury, MotherEscrow}};
#[derive(Accounts)]
pub struct CloseEpochTreasury<'info> {
    #[account(mut, address = mother_escrow.authority)] pub authority: Signer<'info>,
    pub mother_escrow: Box<Account<'info, MotherEscrow>>,
    #[account(mut, has_one = mother_escrow, close = authority)] pub epoch_treasury: Box<Account<'info, EpochTreasury>>,
    #[account(mut, has_one = epoch_treasury, close = authority)] pub epoch_ledger: Box<Account<'info, EpochSettlementLedger>>,
    #[account(seeds = [TSN_EPOCH_TREASURY_AUTHORITY_SEED, epoch_treasury.key().as_ref()], bump)] pub treasury_authority: UncheckedAccount<'info>,
    #[account(mut, address = epoch_treasury.token_account)] pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}
pub fn close_epoch_treasury(ctx: Context<CloseEpochTreasury>) -> Result<()> {
    require!(!ctx.accounts.epoch_treasury.closed && ctx.accounts.epoch_treasury.pending_liability == 0 && ctx.accounts.epoch_treasury.reimbursed_total == ctx.accounts.epoch_treasury.settled_total && ctx.accounts.treasury_token_account.amount == 0, TsnError::EpochNotReady);
    let key = ctx.accounts.epoch_treasury.key(); let signer: &[&[&[u8]]] = &[&[TSN_EPOCH_TREASURY_AUTHORITY_SEED, key.as_ref(), &[ctx.bumps.treasury_authority]]];
    token::close_account(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), token::CloseAccount { account: ctx.accounts.treasury_token_account.to_account_info(), destination: ctx.accounts.authority.to_account_info(), authority: ctx.accounts.treasury_authority.to_account_info() }, signer))?;
    ctx.accounts.epoch_treasury.closed = true; ctx.accounts.epoch_ledger.closed = true; Ok(())
}
