use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::{hash, hashv};
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::tsn::{
    constants::{TSN_CRANKER_VAULT_AUTHORITY_SEED, TSN_PAYMENT_VAULT_SEED},
    errors::TsnError,
    events::TsnSettlementCommitted,
    state::{Cranker, CrankerVault, MotherEscrow, VaultSettlementStatus, VaultState},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
#[instruction(payment_intent_id: u64)]
pub struct ExecuteVaultPayout<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    pub mother_escrow: Box<Account<'info, MotherEscrow>>,

    #[account(
        mut,
        has_one = mother_escrow,
        constraint = cranker.operator == operator.key()
    )]
    pub cranker: Box<Account<'info, Cranker>>,

    #[account(
        mut,
        seeds = [TSN_PAYMENT_VAULT_SEED, payment_intent_id.to_le_bytes().as_ref()],
        bump = payment_vault.bump,
        constraint = payment_vault.payment_intent_id == payment_intent_id
    )]
    pub payment_vault: Box<Account<'info, VaultState>>,

    #[account(
        mut,
        has_one = mother_escrow,
        constraint = cranker_vault.cranker == cranker.key(),
        constraint = cranker_vault.vault_token_account == vault_token_account.key()
    )]
    pub cranker_vault: Box<Account<'info, CrankerVault>>,

    /// CHECK: PDA authority for the vault token account.
    #[account(
        seeds = [TSN_CRANKER_VAULT_AUTHORITY_SEED, cranker_vault.key().as_ref()],
        bump = cranker_vault.vault_authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = vault_token_account.mint == cranker_vault.token_mint,
        constraint = vault_token_account.owner == vault_authority.key() @ TsnError::InvalidCrankerVaultAuthority
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = recipient_token_account.mint == cranker_vault.token_mint
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn execute_vault_payout(
    ctx: Context<ExecuteVaultPayout>,
    _payment_intent_id: u64,
    payout_amount: u64,
    claim_fee_amount: u64,
    otdt: [u8; 32],
    decryption_secret: [u8; 32],
) -> Result<()> {
    require!(payout_amount > 0, TsnError::InvalidPayoutAmount);
    require!(
        ctx.accounts.cranker_vault.total_liquidity >= payout_amount,
        TsnError::InsufficientCrankerVaultLiquidity
    );

    let mother_escrow = &ctx.accounts.mother_escrow;
    let operator = ctx.accounts.operator.key();
    let expected_dna = compute_cranker_dna(&mother_escrow.key(), &operator, &mother_escrow.protocol_seed);
    require!(ctx.accounts.cranker.dna_hash == expected_dna, TsnError::CrankerDnaMismatch);

    let now = Clock::get()?.unix_timestamp;
    let payment_vault = &mut ctx.accounts.payment_vault;
    require!(
        payment_vault.status == VaultSettlementStatus::Leased,
        TsnError::InvalidVaultSettlementState
    );
    require!(now <= payment_vault.lease_expiry_ts, TsnError::LeaseExpired);
    require!(
        payment_vault.lease_cranker == ctx.accounts.cranker.key(),
        TsnError::NotAssignedCranker
    );
    require!(
        !payment_vault.otdt_used,
        TsnError::OneTimeDecryptionTokenAlreadyUsed
    );
    require!(
        hash(&otdt).to_bytes() == payment_vault.otdt_hash,
        TsnError::InvalidOneTimeDecryptionToken
    );
    require!(
        hashv(&[
            b"TSN_SETTLEMENT_V1",
            &payment_vault.transfer_id,
            ctx.accounts.recipient_token_account.owner.as_ref(),
            ctx.accounts.cranker_vault.token_mint.as_ref(),
            &payout_amount.to_le_bytes(),
            &claim_fee_amount.to_le_bytes(),
            &payment_vault.epoch_id.to_le_bytes(),
            &decryption_secret,
        ])
        .to_bytes()
            == payment_vault.commitment_hash,
        TsnError::InvalidSettlementCommitment
    );

    let cranker_vault_key = ctx.accounts.cranker_vault.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        TSN_CRANKER_VAULT_AUTHORITY_SEED,
        cranker_vault_key.as_ref(),
        &[ctx.accounts.cranker_vault.vault_authority_bump],
    ]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        payout_amount,
    )?;

    ctx.accounts.cranker_vault.total_liquidity =
        ctx.accounts.cranker_vault.total_liquidity.saturating_sub(payout_amount);
    ctx.accounts.cranker_vault.total_rewards_accrued = ctx
        .accounts
        .cranker_vault
        .total_rewards_accrued
        .saturating_add(claim_fee_amount);

    ctx.accounts.cranker.total_executes = ctx.accounts.cranker.total_executes.saturating_add(1);
    ctx.accounts.cranker.last_active_ts = now;

    payment_vault.otdt_used = true;
    payment_vault.status = VaultSettlementStatus::Paid;
    payment_vault.settlement_cranker = ctx.accounts.cranker.key();
    payment_vault.paid_at_ts = now;
    payment_vault.recoverable = true;

    emit!(TsnSettlementCommitted {
        vault: payment_vault.key(),
        transfer_id: payment_vault.transfer_id,
        settlement_cranker: payment_vault.settlement_cranker,
        commitment_hash: payment_vault.commitment_hash,
        paid_at_ts: now,
        recoverable: true,
    });

    Ok(())
}
