use anchor_lang::{
    prelude::*,
    system_program::{self, Transfer as SystemTransfer},
};
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::tsn::{
    constants::{
        TSN_CRANKER_SEED, TSN_PAYMENT_VAULT_SEED, TSN_RECOVERY_GAS_REIMBURSEMENT_LAMPORTS,
        TSN_VERIFIER_SEED,
    },
    errors::TsnError,
    events::TsnVaultRecovered,
    state::{Cranker, CrankerVault, MotherEscrow, VaultSettlementStatus, VaultState},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
#[instruction(payment_intent_id: u64)]
pub struct RecoverPaymentVault<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    pub mother_escrow: Account<'info, MotherEscrow>,

    #[account(
        mut,
        seeds = [
            TSN_CRANKER_SEED,
            mother_escrow.key().as_ref(),
            operator.key().as_ref()
        ],
        bump = recovery_cranker.bump,
        has_one = mother_escrow,
        constraint = recovery_cranker.operator == operator.key()
    )]
    pub recovery_cranker: Account<'info, Cranker>,

    #[account(
        mut,
        seeds = [TSN_PAYMENT_VAULT_SEED, payment_intent_id.to_le_bytes().as_ref()],
        bump = payment_vault.bump,
        constraint = payment_vault.payment_intent_id == payment_intent_id
    )]
    pub payment_vault: Account<'info, VaultState>,

    #[account(
        mut,
        constraint = payment_vault_token_account.owner == payment_vault.key()
            @ TsnError::InvalidRecoveryVaultTokenAccount
    )]
    pub payment_vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        has_one = mother_escrow,
        constraint = settlement_cranker_vault.cranker == payment_vault.settlement_cranker
            @ TsnError::InvalidRecoveryDestination,
        constraint = settlement_cranker_vault.token_mint == payment_vault_token_account.mint
            @ TsnError::InvalidRecoveryDestination,
        constraint = settlement_cranker_vault.vault_token_account == settlement_vault_token_account.key()
            @ TsnError::InvalidRecoveryDestination
    )]
    pub settlement_cranker_vault: Account<'info, CrankerVault>,

    #[account(
        mut,
        constraint = settlement_vault_token_account.mint == payment_vault_token_account.mint
            @ TsnError::InvalidRecoveryDestination
    )]
    pub settlement_vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: System-owned protocol reservoir used only for fixed recovery gas reimbursement.
    #[account(mut, seeds = [TSN_VERIFIER_SEED], bump)]
    pub verifier_pda: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn recover_payment_vault(
    ctx: Context<RecoverPaymentVault>,
    payment_intent_id: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let mother_escrow = &ctx.accounts.mother_escrow;
    let expected_dna = compute_cranker_dna(
        &mother_escrow.key(),
        &ctx.accounts.operator.key(),
        &mother_escrow.protocol_seed,
    );
    require!(
        ctx.accounts.recovery_cranker.dna_hash == expected_dna,
        TsnError::CrankerDnaMismatch
    );
    require_keys_eq!(
        *ctx.accounts.verifier_pda.owner,
        system_program::ID,
        TsnError::InvalidVerifierPda
    );

    require!(
        ctx.accounts.payment_vault.recoverable,
        TsnError::VaultNotRecoverable
    );
    require!(
        ctx.accounts.payment_vault.status == VaultSettlementStatus::Recovering,
        TsnError::InvalidVaultSettlementState
    );
    require!(
        now <= ctx.accounts.payment_vault.lease_expiry_ts,
        TsnError::LeaseExpired
    );
    require!(
        ctx.accounts.payment_vault.lease_cranker == ctx.accounts.recovery_cranker.key(),
        TsnError::NotAssignedCranker
    );

    let recovered_amount = ctx.accounts.payment_vault_token_account.amount;
    require!(recovered_amount > 0, TsnError::InvalidPayoutAmount);

    let payment_id_bytes = payment_intent_id.to_le_bytes();
    let payment_vault_bump = ctx.accounts.payment_vault.bump;
    let vault_signer: &[&[u8]] = &[
        TSN_PAYMENT_VAULT_SEED,
        payment_id_bytes.as_ref(),
        &[payment_vault_bump],
    ];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.payment_vault_token_account.to_account_info(),
                to: ctx.accounts.settlement_vault_token_account.to_account_info(),
                authority: ctx.accounts.payment_vault.to_account_info(),
            },
            &[vault_signer],
        ),
        recovered_amount,
    )?;

    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.payment_vault_token_account.to_account_info(),
            destination: ctx.accounts.verifier_pda.to_account_info(),
            authority: ctx.accounts.payment_vault.to_account_info(),
        },
        &[vault_signer],
    ))?;

    ctx.accounts.settlement_cranker_vault.total_liquidity = ctx
        .accounts
        .settlement_cranker_vault
        .total_liquidity
        .checked_add(recovered_amount)
        .ok_or(TsnError::FeeSplitOverflow)?;

    let verifier_bump = ctx.bumps.verifier_pda;
    require!(
        ctx.accounts.verifier_pda.lamports() >= TSN_RECOVERY_GAS_REIMBURSEMENT_LAMPORTS,
        TsnError::InsufficientVerifierLamports
    );
    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            SystemTransfer {
                from: ctx.accounts.verifier_pda.to_account_info(),
                to: ctx.accounts.operator.to_account_info(),
            },
            &[&[TSN_VERIFIER_SEED, &[verifier_bump]]],
        ),
        TSN_RECOVERY_GAS_REIMBURSEMENT_LAMPORTS,
    )?;

    let payment_vault = &mut ctx.accounts.payment_vault;
    payment_vault.status = VaultSettlementStatus::Recovered;
    payment_vault.recoverable = false;
    payment_vault.recovered_at_ts = now;
    ctx.accounts.recovery_cranker.last_active_ts = now;

    emit!(TsnVaultRecovered {
        vault: payment_vault.key(),
        settlement_cranker: payment_vault.settlement_cranker,
        recovery_cranker: ctx.accounts.recovery_cranker.key(),
        recovered_amount,
        recovered_at_ts: now,
    });
    Ok(())
}
