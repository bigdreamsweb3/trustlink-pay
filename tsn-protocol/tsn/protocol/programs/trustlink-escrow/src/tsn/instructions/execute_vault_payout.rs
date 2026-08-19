use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::{hash, hashv};
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::tsn::{
    constants::{BPS_DENOMINATOR, TSN_CRANKER_VAULT_AUTHORITY_SEED, TSN_PAYMENT_VAULT_SEED, TSN_SPLIT_BPS_RECOVERY_BONUS},
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

    #[account(
        mut,
        constraint = operator_token_account.owner == operator.key(),
        constraint = operator_token_account.mint == cranker_vault.token_mint
    )]
    pub operator_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = treasury_token_account.mint == cranker_vault.token_mint
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = reserve_pool_token_account.mint == cranker_vault.token_mint
    )]
    pub reserve_pool_token_account: Box<Account<'info, TokenAccount>>,

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
    let operator_fee_amount = split_fee_floor(
        claim_fee_amount,
        ctx.accounts.mother_escrow.fee_split_cranker_bps,
    )?;
    let treasury_fee_amount = split_fee_floor(
        claim_fee_amount,
        ctx.accounts.mother_escrow.fee_split_treasury_bps,
    )?;
    let reserve_fee_amount = split_fee_floor(
        claim_fee_amount,
        TSN_SPLIT_BPS_RECOVERY_BONUS,
    )?;
    let external_fee_amount = operator_fee_amount
        .checked_add(treasury_fee_amount)
        .and_then(|value| value.checked_add(reserve_fee_amount))
        .ok_or(TsnError::FeeSplitOverflow)?;
    let lp_fee_amount = claim_fee_amount
        .checked_sub(external_fee_amount)
        .ok_or(TsnError::InvalidFeeSplit)?;
    let total_debit = payout_amount
        .checked_add(external_fee_amount)
        .ok_or(TsnError::FeeSplitOverflow)?;
    let reserved_amount = ctx.accounts.payment_vault.reserved_amount;
    require!(
        reserved_amount >= total_debit,
        TsnError::InvalidLiquidityReservation
    );
    require!(
        ctx.accounts.cranker_vault.total_liquidity >= total_debit,
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

    transfer_from_vault(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.vault_token_account.to_account_info(),
        ctx.accounts.operator_token_account.to_account_info(),
        ctx.accounts.vault_authority.to_account_info(),
        signer_seeds,
        operator_fee_amount,
    )?;
    transfer_from_vault(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.vault_token_account.to_account_info(),
        ctx.accounts.treasury_token_account.to_account_info(),
        ctx.accounts.vault_authority.to_account_info(),
        signer_seeds,
        treasury_fee_amount,
    )?;
    transfer_from_vault(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.vault_token_account.to_account_info(),
        ctx.accounts.reserve_pool_token_account.to_account_info(),
        ctx.accounts.vault_authority.to_account_info(),
        signer_seeds,
        reserve_fee_amount,
    )?;

    ctx.accounts.cranker_vault.total_liquidity = ctx
        .accounts
        .cranker_vault
        .total_liquidity
        .checked_sub(total_debit)
        .ok_or(TsnError::InsufficientCrankerVaultLiquidity)?;
    ctx.accounts.cranker_vault.reserved_liquidity = ctx
        .accounts
        .cranker_vault
        .reserved_liquidity
        .checked_sub(reserved_amount)
        .ok_or(TsnError::InvalidLiquidityReservation)?;
    ctx.accounts.cranker_vault.total_rewards_accrued = ctx
        .accounts
        .cranker_vault
        .total_rewards_accrued
        .saturating_add(lp_fee_amount);

    ctx.accounts.cranker.total_executes = ctx.accounts.cranker.total_executes.saturating_add(1);
    ctx.accounts.cranker.last_active_ts = now;

    payment_vault.otdt_used = true;
    payment_vault.status = VaultSettlementStatus::Paid;
    payment_vault.settlement_cranker = ctx.accounts.cranker.key();
    payment_vault.paid_at_ts = now;
    payment_vault.recoverable = true;
    payment_vault.reserved_amount = 0;

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

fn split_fee_floor(amount: u64, bps: u16) -> Result<u64> {
    amount
        .checked_mul(bps as u64)
        .and_then(|value| value.checked_div(BPS_DENOMINATOR))
        .ok_or(TsnError::FeeSplitOverflow.into())
}

fn transfer_from_vault<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token::transfer(
        CpiContext::new_with_signer(
            token_program,
            Transfer {
                from,
                to,
                authority,
            },
            signer_seeds,
        ),
        amount,
    )
}
