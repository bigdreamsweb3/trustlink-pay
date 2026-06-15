use anchor_lang::{
    prelude::*,
    solana_program::{program_pack::Pack, sysvar},
    system_program::{self, Transfer as SystemTransfer},
};
use anchor_spl::{
    associated_token::{self, get_associated_token_address, AssociatedToken},
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::tsn::{
    constants::{
        TSN_CRANKER_VAULT_AUTHORITY_SEED,
        TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS,
        TSN_PRIVATE_REPLAY_REGISTRY_SEED, TSN_PRIVATE_SETTLEMENT_CONFIG_SEED,
        TSN_VERIFIER_SEED,
    },
    errors::TsnError,
    events::TsnPrivatePayoutExecuted,
    state::{
        Cranker, CrankerVault, MotherEscrow, PrivateReplayRegistry,
        PrivateSettlementConfig,
    },
    utils::{compute_cranker_dna, private_payout_message, verify_ed25519_permit},
};

#[derive(Accounts)]
#[instruction(payout_nullifier: [u8; 32])]
pub struct ExecutePrivatePayout<'info> {
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

    #[account(
        mut,
        has_one = mother_escrow,
        constraint = cranker_vault.cranker == cranker.key(),
        constraint = cranker_vault.vault_token_account == vault_token_account.key()
    )]
    pub cranker_vault: Box<Account<'info, CrankerVault>>,

    /// CHECK: PDA authority for the shared Cranker liquidity token account.
    #[account(
        seeds = [TSN_CRANKER_VAULT_AUTHORITY_SEED, cranker_vault.key().as_ref()],
        bump = cranker_vault.vault_authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = vault_token_account.mint == cranker_vault.token_mint,
        constraint = vault_token_account.owner == vault_authority.key()
            @ TsnError::InvalidCrankerVaultAuthority
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: Recipient wallet owns the canonical associated token account.
    pub recipient_wallet: UncheckedAccount<'info>,

    #[account(
        constraint = token_mint.key() == cranker_vault.token_mint
    )]
    pub token_mint: Box<Account<'info, Mint>>,

    /// CHECK: Canonical ATA, created by the verifier PDA when missing.
    #[account(mut)]
    pub recipient_token_account: UncheckedAccount<'info>,

    /// CHECK: Ed25519 instruction introspection sysvar.
    #[account(address = sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    /// CHECK: System-owned protocol reservoir used to reimburse nullifier setup and gas.
    #[account(mut, seeds = [TSN_VERIFIER_SEED], bump)]
    pub verifier_pda: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn execute_private_payout(
    ctx: Context<ExecutePrivatePayout>,
    payout_nullifier: [u8; 32],
    payout_sequence: u64,
    payout_amount: u64,
    claim_fee_amount: u64,
    expires_at_ts: i64,
    permit_signature: [u8; 64],
) -> Result<()> {
    require!(
        ctx.accounts.private_settlement_config.enabled,
        TsnError::PrivateSettlementDisabled
    );
    let now = Clock::get()?.unix_timestamp;
    require!(now <= expires_at_ts, TsnError::PermitExpired);
    require!(payout_amount > 0, TsnError::InvalidPayoutAmount);
    require!(
        payout_sequence == ctx.accounts.private_replay_registry.next_payout_sequence,
        TsnError::InvalidPrivateReplaySequence
    );
    require!(
        ctx.accounts.cranker.claim_credits > 0,
        TsnError::InsufficientCrankerClaimCredits
    );
    require!(
        ctx.accounts.cranker_vault.total_liquidity >= payout_amount,
        TsnError::InsufficientCrankerVaultLiquidity
    );
    require_keys_eq!(
        *ctx.accounts.verifier_pda.owner,
        system_program::ID,
        TsnError::InvalidVerifierPda
    );
    require_keys_eq!(
        ctx.accounts.recipient_token_account.key(),
        get_associated_token_address(
            &ctx.accounts.recipient_wallet.key(),
            &ctx.accounts.token_mint.key(),
        ),
        TsnError::InvalidRecoveryDestination
    );

    let expected_dna = compute_cranker_dna(
        &ctx.accounts.mother_escrow.key(),
        &ctx.accounts.operator.key(),
        &ctx.accounts.mother_escrow.protocol_seed,
    );
    require!(
        ctx.accounts.cranker.dna_hash == expected_dna,
        TsnError::CrankerDnaMismatch
    );

    let message = private_payout_message(
        ctx.program_id,
        &ctx.accounts.mother_escrow.key(),
        &ctx.accounts.operator.key(),
        &payout_nullifier,
        payout_sequence,
        &ctx.accounts.cranker_vault.key(),
        &ctx.accounts.recipient_token_account.key(),
        &ctx.accounts.cranker_vault.token_mint,
        payout_amount,
        claim_fee_amount,
        expires_at_ts,
    );
    verify_ed25519_permit(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &ctx.accounts.private_settlement_config.permit_signer,
        &permit_signature,
        &message,
    )?;

    let verifier_bump = ctx.bumps.verifier_pda;
    let verifier_bump_seed = [verifier_bump];
    let verifier_signer: &[&[u8]] = &[TSN_VERIFIER_SEED, &verifier_bump_seed];
    if ctx.accounts.recipient_token_account.lamports() == 0 {
        let required_verifier_lamports = Rent::get()?
            .minimum_balance(anchor_spl::token::spl_token::state::Account::LEN)
            .checked_add(TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS)
            .ok_or(TsnError::FeeSplitOverflow)?;
        require!(
            ctx.accounts.verifier_pda.lamports() >= required_verifier_lamports,
            TsnError::InsufficientVerifierLamports
        );
        associated_token::create(CpiContext::new_with_signer(
            ctx.accounts.associated_token_program.to_account_info(),
            associated_token::Create {
                payer: ctx.accounts.verifier_pda.to_account_info(),
                associated_token: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.recipient_wallet.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
            &[verifier_signer],
        ))?;
    }
    let recipient_token_data = ctx.accounts.recipient_token_account.try_borrow_data()?;
    let recipient_token_state =
        anchor_spl::token::spl_token::state::Account::unpack(&recipient_token_data)?;
    require_keys_eq!(
        recipient_token_state.owner,
        ctx.accounts.recipient_wallet.key(),
        TsnError::InvalidRecoveryDestination
    );
    require_keys_eq!(
        recipient_token_state.mint,
        ctx.accounts.token_mint.key(),
        TsnError::InvalidRecoveryDestination
    );
    drop(recipient_token_data);

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

    ctx.accounts.cranker_vault.total_liquidity = ctx
        .accounts
        .cranker_vault
        .total_liquidity
        .checked_sub(payout_amount)
        .ok_or(TsnError::InsufficientCrankerVaultLiquidity)?;
    ctx.accounts.cranker_vault.total_rewards_accrued = ctx
        .accounts
        .cranker_vault
        .total_rewards_accrued
        .checked_add(claim_fee_amount)
        .ok_or(TsnError::FeeSplitOverflow)?;
    ctx.accounts.cranker.claim_credits = ctx.accounts.cranker.claim_credits.saturating_sub(1);
    ctx.accounts.cranker.total_claims = ctx.accounts.cranker.total_claims.saturating_add(1);
    ctx.accounts.cranker.total_executes = ctx.accounts.cranker.total_executes.saturating_add(1);
    ctx.accounts.cranker.last_active_ts = now;

    ctx.accounts.private_replay_registry.next_payout_sequence = payout_sequence
        .checked_add(1)
        .ok_or(TsnError::PrivateReplaySequenceOverflow)?;

    let reimbursement = TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS;
    require!(
        ctx.accounts.verifier_pda.lamports() >= reimbursement,
        TsnError::InsufficientVerifierLamports
    );
    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            SystemTransfer {
                from: ctx.accounts.verifier_pda.to_account_info(),
                to: ctx.accounts.operator.to_account_info(),
            },
            &[verifier_signer],
        ),
        reimbursement,
    )?;

    emit!(TsnPrivatePayoutExecuted {
        payout_nullifier,
        payout_sequence,
        cranker: ctx.accounts.cranker.key(),
        token_mint: ctx.accounts.cranker_vault.token_mint,
        payout_amount,
    });
    Ok(())
}
