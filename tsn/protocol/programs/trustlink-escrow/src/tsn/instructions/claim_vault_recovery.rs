use anchor_lang::prelude::*;

use crate::tsn::{
    constants::{TSN_CRANKER_SEED, TSN_PAYMENT_VAULT_SEED},
    errors::TsnError,
    events::TsnRecoveryLeaseClaimed,
    state::{Cranker, MotherEscrow, VaultSettlementStatus, VaultState},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
#[instruction(payment_intent_id: u64)]
pub struct ClaimVaultRecovery<'info> {
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
        bump = cranker.bump,
        has_one = mother_escrow,
        constraint = cranker.operator == operator.key()
    )]
    pub cranker: Account<'info, Cranker>,

    #[account(
        mut,
        seeds = [TSN_PAYMENT_VAULT_SEED, payment_intent_id.to_le_bytes().as_ref()],
        bump = payment_vault.bump,
        constraint = payment_vault.payment_intent_id == payment_intent_id
    )]
    pub payment_vault: Account<'info, VaultState>,
}

pub fn claim_vault_recovery(
    ctx: Context<ClaimVaultRecovery>,
    _payment_intent_id: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let mother_escrow = &ctx.accounts.mother_escrow;
    let expected_dna = compute_cranker_dna(
        &mother_escrow.key(),
        &ctx.accounts.operator.key(),
        &mother_escrow.protocol_seed,
    );
    require!(
        ctx.accounts.cranker.dna_hash == expected_dna,
        TsnError::CrankerDnaMismatch
    );

    let vault = &mut ctx.accounts.payment_vault;
    require!(vault.recoverable, TsnError::VaultNotRecoverable);
    require!(
        vault.status == VaultSettlementStatus::Paid
            || (vault.status == VaultSettlementStatus::Recovering && now > vault.lease_expiry_ts),
        TsnError::RecoveryLeaseStillActive
    );

    vault.status = VaultSettlementStatus::Recovering;
    vault.lease_cranker = ctx.accounts.cranker.key();
    vault.lease_expiry_ts = now
        .checked_add(mother_escrow.lease_seconds)
        .ok_or(TsnError::IntentNotClaimable)?;
    ctx.accounts.cranker.last_active_ts = now;

    emit!(TsnRecoveryLeaseClaimed {
        vault: vault.key(),
        recovery_cranker: ctx.accounts.cranker.key(),
        lease_expiry_ts: vault.lease_expiry_ts,
    });
    Ok(())
}
