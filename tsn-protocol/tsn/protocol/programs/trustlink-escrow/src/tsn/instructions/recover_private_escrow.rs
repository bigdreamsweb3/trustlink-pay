use anchor_lang::{
    prelude::*,
    solana_program::sysvar,
    system_program::{self, Transfer as SystemTransfer},
};
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::tsn::{
    constants::{
        TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS, TSN_PRIVATE_ESCROW_RECORD_SEED,
        TSN_PRIVATE_REPLAY_REGISTRY_SEED, TSN_PRIVATE_SETTLEMENT_CONFIG_SEED,
        TSN_SHARED_ESCROW_AUTHORITY_SEED, TSN_VERIFIER_SEED,
    },
    errors::TsnError,
    events::TsnPrivateEscrowRecovered,
    state::{
        Cranker, CrankerVault, MotherEscrow, PrivateEscrowRecord, PrivateReplayRegistry,
        PrivateSettlementConfig,
    },
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
        mut,
        seeds = [TSN_PRIVATE_REPLAY_REGISTRY_SEED, mother_escrow.key().as_ref()],
        bump = private_replay_registry.bump,
        has_one = mother_escrow
    )]
    pub private_replay_registry: Box<Account<'info, PrivateReplayRegistry>>,

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
        seeds = [TSN_PRIVATE_ESCROW_RECORD_SEED, escrow_token_account.key().as_ref()],
        bump = private_escrow_record.bump,
        has_one = mother_escrow,
        constraint = private_escrow_record.escrow_token_account == escrow_token_account.key(),
        constraint = private_escrow_record.token_mint == escrow_token_account.mint
    )]
    pub private_escrow_record: Box<Account<'info, PrivateEscrowRecord>>,

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
    recovery_sequence: u64,
    payment_id_hash: [u8; 32],
    commitment_hash: [u8; 32],
    payout_nullifier: [u8; 32],
    recovery_amount: u64,
    lease_id_hash: [u8; 32],
    lease_version: u64,
    lease_expiry_ts: i64,
    expires_at_ts: i64,
    permit_signature: [u8; 64],
) -> Result<()> {
    require!(
        ctx.accounts.private_settlement_config.enabled,
        TsnError::PrivateSettlementDisabled
    );
    let now = Clock::get()?.unix_timestamp;
    require!(now <= expires_at_ts, TsnError::PermitExpired);
    require!(now <= lease_expiry_ts && expires_at_ts <= lease_expiry_ts, TsnError::PermitExpired);
    require!(
        recovery_amount > 0 && ctx.accounts.escrow_token_account.amount == recovery_amount,
        TsnError::InvalidPrivateRecoveryAmount
    );
    require!(
        ctx.accounts.private_escrow_record.paid
            && !ctx.accounts.private_escrow_record.recovered
            && ctx.accounts.private_escrow_record.amount == recovery_amount,
        TsnError::InvalidPrivateRecoveryAmount
    );
    require!(
        ctx.accounts.private_escrow_record.payment_id_hash == payment_id_hash
            && ctx.accounts.private_escrow_record.commitment_hash == commitment_hash
            && ctx.accounts.private_escrow_record.payout_nullifier == payout_nullifier,
        TsnError::InvalidPrivateRecoveryAmount
    );
    require!(
        recovery_sequence == ctx.accounts.private_replay_registry.next_recovery_sequence,
        TsnError::InvalidPrivateReplaySequence
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
    require_keys_eq!(
        ctx.accounts.private_escrow_record.settlement_cranker,
        ctx.accounts.settlement_cranker_vault.cranker,
        TsnError::InvalidRecoveryDestination
    );

    let message = private_recovery_message(
        ctx.program_id,
        &ctx.accounts.mother_escrow.key(),
        &ctx.accounts.operator.key(),
        &recovery_nullifier,
        recovery_sequence,
        &ctx.accounts.escrow_token_account.key(),
        &ctx.accounts.settlement_cranker_vault.key(),
        &ctx.accounts.settlement_vault_token_account.key(),
        &ctx.accounts.escrow_token_account.mint,
        &payment_id_hash,
        &commitment_hash,
        &payout_nullifier,
        recovery_amount,
        &lease_id_hash,
        lease_version,
        lease_expiry_ts,
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
    ctx.accounts.private_escrow_record.recovered = true;

    ctx.accounts.private_replay_registry.next_recovery_sequence = recovery_sequence
        .checked_add(1)
        .ok_or(TsnError::PrivateReplaySequenceOverflow)?;

    let reimbursement = TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS;
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
        recovery_sequence,
        recovery_cranker: ctx.accounts.recovery_cranker.key(),
        token_mint: ctx.accounts.escrow_token_account.mint,
        recovered_amount: recovery_amount,
    });
    Ok(())
}
