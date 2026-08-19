use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::tsn::{constants::{TSN_CRANKER_VAULT_AUTHORITY_SEED, TSN_PRIVATE_SETTLEMENT_DNA_SEED, TSN_TREASURY_SEED}, errors::TsnError, events::TsnPrivateDnaReimbursed, state::{CrankerVault, MotherEscrow, PrivateSettlementDna}};

#[derive(Accounts)]
#[instruction(payment_id_hash: [u8; 32], commitment_digest: [u8; 32])]
pub struct SettlePrivateDnaReimbursement<'info> {
    pub authority: Signer<'info>,
    pub mother_escrow: Box<Account<'info, MotherEscrow>>,
    #[account(seeds = [TSN_TREASURY_SEED], bump)] pub treasury_pda: UncheckedAccount<'info>,
    #[account(mut, seeds = [TSN_PRIVATE_SETTLEMENT_DNA_SEED, payment_id_hash.as_ref(), commitment_digest.as_ref()], bump = settlement_dna.bump)] pub settlement_dna: Box<Account<'info, PrivateSettlementDna>>,
    #[account(mut, has_one = mother_escrow, constraint = cranker_vault.key() == settlement_dna.cranker_vault, constraint = cranker_vault.vault_token_account == vault_token_account.key())] pub cranker_vault: Box<Account<'info, CrankerVault>>,
    /// CHECK: PDA authority for the destination vault token account.
    #[account(seeds = [TSN_CRANKER_VAULT_AUTHORITY_SEED, cranker_vault.key().as_ref()], bump = cranker_vault.vault_authority_bump)] pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = vault_token_account.owner == vault_authority.key(), constraint = vault_token_account.mint == token_mint.key())] pub vault_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = treasury_token_account.owner == treasury_pda.key(), constraint = treasury_token_account.mint == token_mint.key())] pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    pub token_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn settle_private_dna_reimbursement(ctx: Context<SettlePrivateDnaReimbursement>, _payment_id_hash: [u8; 32], _commitment_digest: [u8; 32]) -> Result<()> {
    require!(ctx.accounts.mother_escrow.authority == ctx.accounts.authority.key(), TsnError::Unauthorized);
    let dna = &mut ctx.accounts.settlement_dna;
    require!(dna.consumed && !dna.reimbursed && dna.reimbursement_amount > 0, TsnError::InvalidVaultSettlementState);
    require!(dna.token_mint == ctx.accounts.token_mint.key(), TsnError::InvalidPrivateCommitment);
    require!(ctx.accounts.treasury_token_account.amount >= dna.reimbursement_amount, TsnError::InsufficientCrankerVaultLiquidity);
    let bump = ctx.bumps.treasury_pda;
    let signer: &[&[&[u8]]] = &[&[TSN_TREASURY_SEED, &[bump]]];
    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer { from: ctx.accounts.treasury_token_account.to_account_info(), to: ctx.accounts.vault_token_account.to_account_info(), authority: ctx.accounts.treasury_pda.to_account_info() }, signer), dna.reimbursement_amount)?;
    ctx.accounts.cranker_vault.total_liquidity = ctx.accounts.cranker_vault.total_liquidity.checked_add(dna.reimbursement_amount).ok_or(TsnError::FeeSplitOverflow)?;
    dna.reimbursed = true;
    emit!(TsnPrivateDnaReimbursed { settlement_dna: dna.key(), cranker_vault: ctx.accounts.cranker_vault.key(), amount: dna.reimbursement_amount, cranker: dna.settlement_cranker });
    Ok(())
}
