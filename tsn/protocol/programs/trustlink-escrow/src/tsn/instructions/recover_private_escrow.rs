use anchor_lang::{
    prelude::*,
    solana_program::sysvar,
    system_program::{self, Transfer as SystemTransfer},
};
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::tsn::{
    constants::{
        TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS,
        TSN_PRIVATE_SETTLEMENT_CONFIG_SEED, TSN_RECOVERY_NULLIFIER_SEED,
        TSN_SHARED_ESCROW_AUTHORITY_SEED, TSN_VERIFIER_SEED,
    },
    errors::TsnError,
    events::TsnPrivateEscrowRecovered,
    state::{Cranker, CrankerVault, MotherEscrow, PrivateSettlementConfig, SpentNullifier},
    utils::{compute_cranker_dna, private_recovery_message, verify_ed25519_permit},
};

#[derive(Accounts)]
#[instruction(recovery_nullifier: [u8; 32])]
pub struct RecoverPrivateEscrow<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    pub mother_escrow: Box<Account<'info, MotherEscrow>>,

    #[account(
        mut,
        has_one = mother_escrow,
        constraint = recovery_cranker.operator == operator.key()
    )]
    pub recovery_cranker: Box<Account<'info, Cranker>>,

    #[account(
        seeds = [TSN_PRIVATE_SETTLEMENT_CONFIG_SEED, mother_escrow.key().as_ref()],
        bump = private_settlement_config.bump,
        has_one = mother_escrow
    )]
    pub private_settlement_config: Box<Account<'info, PrivateSettlementConfig>>,

    #[account(
        init,
        payer = operator,
        space = SpentNullifier::SPACE,
        seeds = [TSN_RECOVERY_NULLIFIER_SEED, recovery_nullifier.as_ref()],
        bump
    )]
    pub spent_nullifier: Account<'info, SpentNullifier>,

    /// CHECK: Shared authority controls random one-time escrow token accounts.
    #[account(
        seeds = [TSN_SHARED_ESCROW_AUTHORITY_SEED, mother_escrow.key().as_ref()],
        bump
    )]
    pub shared_escrow_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = escrow_token_account.owner == shared_escrow_authority.key()
            @ TsnError::InvalidPrivateEscrowTokenAccount
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        has_one = mother_escrow,
        constraint = settlement_cranker_vault.token_mint == escrow_token_account.mint
            @ TsnError::InvalidRecoveryDestination,
        constraint = settlement_cranker_vault.vault_token_account == settlement_vault_token_account.key()
            @ TsnError::InvalidRecoveryDestination
    )]
    pub settlement_cranker_vault: Box<Account<'info, CrankerVault>>,

    #[account(
        mut,
        constraint = settlement_vault_token_account.mint == escrow_token_account.mint
            @ TsnError::InvalidRecoveryDestination
    )]
    pub settlement_vault_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: Ed25519 instruction introspection sysvar.
    #[account(address = sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    /// CHECK: System-owned reservoir receives closed-account rent and reimburses execution.
    #[account(mut, seeds = [TSN_VERIFIER_SEED], bump)]
    pub verifier_pda: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn recover_private_escrow(
    ctx: Context<RecoverPrivateEscrow>,
    recovery_nullifier: [u8; 32],
    recovery_amount: u64,
    expires_at_ts: i64,
    permit_signature: [u8; 64],
) -> Result<()> {
    require!(
        ctx.accounts.private_settlement_config.enabled,
        TsnError::PrivateSettlementDisabled
    );
    let now = Clock::get()?.unix_timestamp;
    require!(now <= expires_at_ts, TsnError::PermitExpired);
    require!(
        recovery_amount > 0 && ctx.accounts.escrow_token_account.amount == recovery_amount,
        TsnError::InvalidPrivateRecoveryAmount
    );
    require_keys_eq!(
        *ctx.accounts.verifier_pda.owner,
        system_program::ID,
        TsnError::InvalidVerifierPda
    );

    let expected_dna = compute_cranker_dna(
        &ctx.accounts.mother_escrow.key(),
        &ctx.accounts.operator.key(),
        &ctx.accounts.mother_escrow.protocol_seed,
    );
    require!(
        ctx.accounts.recovery_cranker.dna_hash == expected_dna,
        TsnError::CrankerDnaMismatch
    );

    let message = private_recovery_message(
        ctx.program_id,
        &ctx.accounts.mother_escrow.key(),
        &ctx.accounts.operator.key(),
        &recovery_nullifier,
        &ctx.accounts.escrow_token_account.key(),
        &ctx.accounts.settlement_cranker_vault.key(),
        &ctx.accounts.settlement_vault_token_account.key(),
        &ctx.accounts.escrow_token_account.mint,
        recovery_amount,
        expires_at_ts,
    );
    verify_ed25519_permit(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &ctx.accounts.private_settlement_config.permit_signer,
        &permit_signature,
        &message,
    )?;

    let mother_escrow_key = ctx.accounts.mother_escrow.key();
    let authority_bump = ctx.bumps.shared_escrow_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[
        TSN_SHARED_ESCROW_AUTHORITY_SEED,
        mother_escrow_key.as_ref(),
        &[authority_bump],
    ]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.settlement_vault_token_account.to_account_info(),
                authority: ctx.accounts.shared_escrow_authority.to_account_info(),
            },
            signer_seeds,
        ),
        recovery_amount,
    )?;
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.escrow_token_account.to_account_info(),
            destination: ctx.accounts.verifier_pda.to_account_info(),
            authority: ctx.accounts.shared_escrow_authority.to_account_info(),
        },
        signer_seeds,
    ))?;

    ctx.accounts.settlement_cranker_vault.total_liquidity = ctx
        .accounts
        .settlement_cranker_vault
        .total_liquidity
        .checked_add(recovery_amount)
        .ok_or(TsnError::FeeSplitOverflow)?;
    ctx.accounts.recovery_cranker.last_active_ts = now;

    let nullifier = &mut ctx.accounts.spent_nullifier;
    nullifier.mother_escrow = ctx.accounts.mother_escrow.key();
    nullifier.nullifier = recovery_nullifier;
    nullifier.operator = ctx.accounts.operator.key();
    nullifier.action = SpentNullifier::ACTION_RECOVERY;
    nullifier.used_at_ts = now;
    nullifier.bump = ctx.bumps.spent_nullifier;

    let reimbursement = Rent::get()?
        .minimum_balance(SpentNullifier::SPACE)
        .checked_add(TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS)
        .ok_or(TsnError::PaymentIntentFundingOverflow)?;
    require!(
        ctx.accounts.verifier_pda.lamports() >= reimbursement,
        TsnError::InsufficientVerifierLamports
    );
    let verifier_bump = ctx.bumps.verifier_pda;
    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            SystemTransfer {
                from: ctx.accounts.verifier_pda.to_account_info(),
                to: ctx.accounts.operator.to_account_info(),
            },
            &[&[TSN_VERIFIER_SEED, &[verifier_bump]]],
        ),
        reimbursement,
    )?;

    emit!(TsnPrivateEscrowRecovered {
        recovery_nullifier,
        recovery_cranker: ctx.accounts.recovery_cranker.key(),
        token_mint: ctx.accounts.escrow_token_account.mint,
        recovered_amount: recovery_amount,
    });
    Ok(())
}
