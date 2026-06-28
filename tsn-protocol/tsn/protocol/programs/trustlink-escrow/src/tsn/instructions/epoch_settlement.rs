use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

use crate::tsn::{
    constants::{
        BPS_DENOMINATOR, TSN_CRANKER_SEED, TSN_EPOCH_ACCOUNT_SEED, TSN_PAYMENT_COMMITMENT_SEED,
        TSN_PRIVACY_RECEIVE_SEED,
    },
    errors::TsnError,
    events::{
        TsnEpochChallengeCommitted, TsnEpochReimbursementProcessed, TsnPaymentCommitmentOpened,
        TsnPrivacyReceiveCreated, TsnResidualSwept,
    },
    state::{Cranker, EpochAccount, MotherEscrow, PaymentCommitment, PrivacyReceivePda},
    utils::compute_cranker_dna,
};

pub const LP_BPS: u64 = 8_500;
pub const OPERATOR_BPS: u64 = 800;
pub const TREASURY_BPS: u64 = 500;
pub const RECOVERY_BONUS_BPS: u64 = 200;
pub const RESIDUAL_SWEEP_SECONDS: i64 = 14 * 24 * 60 * 60;

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct InitializeEpoch<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(has_one = authority @ TsnError::Unauthorized)]
    pub mother_escrow: Account<'info, MotherEscrow>,
    #[account(init, payer = authority, space = EpochAccount::SPACE, seeds = [TSN_EPOCH_ACCOUNT_SEED, mother_escrow.key().as_ref(), &epoch_id.to_le_bytes()], bump)]
    pub epoch_account: Account<'info, EpochAccount>,
    /// CHECK: deterministic PEA token account address is created by deployment/runtime tooling for v1.
    pub pea: UncheckedAccount<'info>,
    /// CHECK: mint is recorded for deterministic PEA derivation without exposing transfer graph metadata.
    pub token_mint: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_epoch(ctx: Context<InitializeEpoch>, epoch_id: u64) -> Result<()> {
    let epoch = &mut ctx.accounts.epoch_account;
    epoch.mother_escrow = ctx.accounts.mother_escrow.key();
    epoch.epoch_id = epoch_id;
    epoch.token_mint = ctx.accounts.token_mint.key();
    epoch.pea = ctx.accounts.pea.key();
    epoch.aggregate_root_hash = [0; 32];
    epoch.total_to_distribute = 0;
    epoch.cranker_credit_sum_mod = 0;
    epoch.committed_at_ts = 0;
    epoch.first_recovery_cranker = Pubkey::default();
    epoch.recovery_processed = false;
    epoch.residual_swept = false;
    epoch.bump = ctx.bumps.epoch_account;
    Ok(())
}

#[derive(Accounts)]
#[instruction(commitment_hash: [u8; 32])]
pub struct OpenPaymentCommitment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub epoch_account: Account<'info, EpochAccount>,
    #[account(init, payer = payer, space = PaymentCommitment::SPACE, seeds = [TSN_PAYMENT_COMMITMENT_SEED, epoch_account.key().as_ref(), commitment_hash.as_ref()], bump)]
    pub payment_commitment: Account<'info, PaymentCommitment>,
    pub system_program: Program<'info, System>,
}

pub fn open_payment_commitment(
    ctx: Context<OpenPaymentCommitment>,
    commitment_hash: [u8; 32],
    amount: u64,
    nullifier_hash: [u8; 32],
    tin_route_hash: [u8; 32],
    cranker_lease: Pubkey,
    expiry_ts: i64,
) -> Result<()> {
    require!(
        commitment_hash != [0; 32] && amount > 0,
        TsnError::InvalidPrivateCommitment
    );
    let p = &mut ctx.accounts.payment_commitment;
    p.epoch_account = ctx.accounts.epoch_account.key();
    p.commitment_hash = commitment_hash;
    p.amount = amount;
    p.nullifier_hash = nullifier_hash;
    p.tin_route_hash = tin_route_hash;
    p.cranker_lease = cranker_lease;
    p.expiry_ts = expiry_ts;
    p.reimbursed = false;
    p.bump = ctx.bumps.payment_commitment;
    let e = &mut ctx.accounts.epoch_account;
    e.aggregate_root_hash = hashv(&[
        b"tsn_epoch_root",
        e.aggregate_root_hash.as_ref(),
        commitment_hash.as_ref(),
        &amount.to_le_bytes(),
    ])
    .to_bytes();
    e.total_to_distribute = e
        .total_to_distribute
        .checked_add(amount)
        .ok_or(TsnError::FeeSplitOverflow)?;
    emit!(TsnPaymentCommitmentOpened {
        epoch_account: e.key(),
        commitment_hash,
        amount
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(tin_route_hash: [u8; 32])]
pub struct CreatePrivacyReceive<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mother_escrow: Account<'info, MotherEscrow>,
    #[account(init, payer = owner, space = PrivacyReceivePda::SPACE, seeds = [TSN_PRIVACY_RECEIVE_SEED, mother_escrow.key().as_ref(), tin_route_hash.as_ref()], bump)]
    pub privacy_receive: Account<'info, PrivacyReceivePda>,
    pub system_program: Program<'info, System>,
}

pub fn create_privacy_receive(
    ctx: Context<CreatePrivacyReceive>,
    tin_route_hash: [u8; 32],
    owner_commitment: [u8; 32],
) -> Result<()> {
    let p = &mut ctx.accounts.privacy_receive;
    p.mother_escrow = ctx.accounts.mother_escrow.key();
    p.tin_route_hash = tin_route_hash;
    p.owner_commitment = owner_commitment;
    p.active = true;
    p.bump = ctx.bumps.privacy_receive;
    emit!(TsnPrivacyReceiveCreated {
        privacy_receive: p.key(),
        tin_route_hash
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ProcessBatchReimbursement<'info> {
    #[account(mut)]
    pub cranker_operator: Signer<'info>,
    pub mother_escrow: Account<'info, MotherEscrow>,
    #[account(mut, has_one = mother_escrow)]
    pub epoch_account: Account<'info, EpochAccount>,
    #[account(mut, seeds = [TSN_CRANKER_SEED, mother_escrow.key().as_ref(), cranker_operator.key().as_ref()], bump = cranker.bump, has_one = mother_escrow, constraint = cranker.operator == cranker_operator.key())]
    pub cranker: Account<'info, Cranker>,
}

pub fn process_batch_reimbursement(
    ctx: Context<ProcessBatchReimbursement>,
    recomputed_root_hash: [u8; 32],
    total_to_distribute: u64,
    cranker_credit_sum_mod: u64,
) -> Result<()> {
    let expected_dna = compute_cranker_dna(
        &ctx.accounts.mother_escrow.key(),
        &ctx.accounts.cranker_operator.key(),
        &ctx.accounts.mother_escrow.protocol_seed,
    );
    require!(
        ctx.accounts.cranker.dna_hash == expected_dna,
        TsnError::CrankerDnaMismatch
    );
    let e = &mut ctx.accounts.epoch_account;
    require!(
        !e.recovery_processed,
        TsnError::EpochRecoveryAlreadyProcessed
    );
    require!(
        e.aggregate_root_hash == recomputed_root_hash,
        TsnError::InvalidEpochRoot
    );
    require!(
        e.total_to_distribute == total_to_distribute
            && e.cranker_credit_sum_mod == cranker_credit_sum_mod,
        TsnError::InvalidEpochMath
    );
    let lp = total_to_distribute
        .checked_mul(LP_BPS)
        .ok_or(TsnError::FeeSplitOverflow)?
        / BPS_DENOMINATOR;
    let operator = total_to_distribute
        .checked_mul(OPERATOR_BPS)
        .ok_or(TsnError::FeeSplitOverflow)?
        / BPS_DENOMINATOR;
    let treasury = total_to_distribute
        .checked_mul(TREASURY_BPS)
        .ok_or(TsnError::FeeSplitOverflow)?
        / BPS_DENOMINATOR;
    let bonus = total_to_distribute
        .checked_sub(lp)
        .and_then(|x| x.checked_sub(operator))
        .and_then(|x| x.checked_sub(treasury))
        .ok_or(TsnError::FeeSplitOverflow)?;
    e.first_recovery_cranker = ctx.accounts.cranker_operator.key();
    e.recovery_processed = true;
    e.committed_at_ts = Clock::get()?.unix_timestamp;
    emit!(TsnEpochChallengeCommitted {
        epoch_account: e.key(),
        root_hash: recomputed_root_hash,
        total_to_distribute,
        cranker_credit_sum_mod
    });
    emit!(TsnEpochReimbursementProcessed {
        epoch_account: e.key(),
        winner: ctx.accounts.cranker_operator.key(),
        lp_amount: lp,
        operator_amount: operator,
        treasury_amount: treasury,
        bonus_amount: bonus
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ResidualSweep<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(has_one = authority @ TsnError::Unauthorized)]
    pub mother_escrow: Account<'info, MotherEscrow>,
    #[account(mut, has_one = mother_escrow)]
    pub epoch_account: Account<'info, EpochAccount>,
}

pub fn residual_sweep(ctx: Context<ResidualSweep>) -> Result<()> {
    let e = &mut ctx.accounts.epoch_account;
    require!(e.recovery_processed, TsnError::EpochNotReady);
    require!(!e.residual_swept, TsnError::EpochResidualAlreadySwept);
    let now = Clock::get()?.unix_timestamp;
    require!(
        now.saturating_sub(e.committed_at_ts) >= RESIDUAL_SWEEP_SECONDS,
        TsnError::EpochNotReady
    );
    e.residual_swept = true;
    emit!(TsnResidualSwept {
        epoch_account: e.key(),
        swept_at_ts: now
    });
    Ok(())
}
