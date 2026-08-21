use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{self, Mint, Token, TokenAccount, Transfer}};
use crate::tsn::{constants::{TSN_EPOCH_LEDGER_SEED, TSN_EPOCH_TREASURY_AUTHORITY_SEED, TSN_EPOCH_TREASURY_SEED}, errors::TsnError, state::{EpochSettlementLedger, EpochTreasury, MotherEscrow}};

#[derive(Accounts)]
#[instruction(epoch_id: u64, amount: u64)]
pub struct FundEpochTreasury<'info> {
    #[account(mut)] pub funder: Signer<'info>,
    pub mother_escrow: Box<Account<'info, MotherEscrow>>,
    #[account(mut, constraint = funder_token_account.owner == funder.key(), constraint = funder_token_account.mint == token_mint.key())]
    pub funder_token_account: Box<Account<'info, TokenAccount>>,
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(init_if_needed, payer = funder, space = EpochTreasury::SPACE, seeds = [TSN_EPOCH_TREASURY_SEED, mother_escrow.key().as_ref(), &epoch_id.to_le_bytes(), token_mint.key().as_ref()], bump)]
    pub epoch_treasury: Box<Account<'info, EpochTreasury>>,
    #[account(init_if_needed, payer = funder, space = EpochSettlementLedger::SPACE, seeds = [TSN_EPOCH_LEDGER_SEED, epoch_treasury.key().as_ref()], bump)]
    pub epoch_ledger: Box<Account<'info, EpochSettlementLedger>>,
    /// CHECK: PDA authority for the epoch treasury token account.
    #[account(seeds = [TSN_EPOCH_TREASURY_AUTHORITY_SEED, epoch_treasury.key().as_ref()], bump)]
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = funder, associated_token::mint = token_mint, associated_token::authority = treasury_authority)]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn fund_epoch_treasury(ctx: Context<FundEpochTreasury>, epoch_id: u64, amount: u64) -> Result<()> {
    require!(amount > 0, TsnError::InvalidPayoutAmount);
    require!(epoch_id == ctx.accounts.mother_escrow.epoch_id, TsnError::EpochNotReady);
    require!(!ctx.accounts.epoch_treasury.closed && !ctx.accounts.epoch_ledger.closed, TsnError::EpochNotReady);
    let treasury = &mut ctx.accounts.epoch_treasury;
    if treasury.mother_escrow == Pubkey::default() {
        treasury.mother_escrow = ctx.accounts.mother_escrow.key();
        treasury.epoch_id = epoch_id;
        treasury.token_mint = ctx.accounts.token_mint.key();
        treasury.token_account = ctx.accounts.treasury_token_account.key();
        treasury.bump = ctx.bumps.epoch_treasury;
    }
    require_keys_eq!(treasury.mother_escrow, ctx.accounts.mother_escrow.key(), TsnError::InvalidMotherEscrowAccount);
    require_keys_eq!(treasury.token_account, ctx.accounts.treasury_token_account.key(), TsnError::InvalidEpochTreasuryTokenAccount);
    let ledger = &mut ctx.accounts.epoch_ledger;
    if ledger.epoch_treasury == Pubkey::default() {
        ledger.epoch_treasury = treasury.key(); ledger.epoch_id = epoch_id; ledger.token_mint = ctx.accounts.token_mint.key(); ledger.bump = ctx.bumps.epoch_ledger;
    }
    token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer { from: ctx.accounts.funder_token_account.to_account_info(), to: ctx.accounts.treasury_token_account.to_account_info(), authority: ctx.accounts.funder.to_account_info() }), amount)?;
    treasury.total_funded = treasury.total_funded.checked_add(amount).ok_or(TsnError::FeeSplitOverflow)?;
    treasury.pending_liability = treasury.pending_liability.checked_add(amount).ok_or(TsnError::FeeSplitOverflow)?;
    ledger.pending_total = ledger.pending_total.checked_add(amount).ok_or(TsnError::FeeSplitOverflow)?;
    Ok(())
}
