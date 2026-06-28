use anchor_lang::prelude::*;

use crate::tsn::{
    constants::{TSN_CRANKER_SEED, TSN_PAYMENT_VAULT_SEED},
    errors::TsnError,
    events::TsnSettlementLeaseClaimed,
    state::{Cranker, MotherEscrow, VaultSettlementStatus, VaultState},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
#[instruction(payment_intent_id: u64)]
pub struct ClaimVaultSettlement<'info> {
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

pub fn claim_vault_settlement(
    ctx: Context<ClaimVaultSettlement>,
    _payment_intent_id: u64,
    otdt_hash: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let mother_escrow = &ctx.accounts.mother_escrow;
    let cranker = &mut ctx.accounts.cranker;
    let expected_dna = compute_cranker_dna(
        &mother_escrow.key(),
        &ctx.accounts.operator.key(),
        &mother_escrow.protocol_seed,
    );
    require!(cranker.dna_hash == expected_dna, TsnError::CrankerDnaMismatch);
    require!(cranker.claim_credits > 0, TsnError::InsufficientCrankerClaimCredits);
    require!(otdt_hash != [0; 32], TsnError::InvalidOneTimeDecryptionToken);

    let vault = &mut ctx.accounts.payment_vault;
    require!(!vault.otdt_used, TsnError::OneTimeDecryptionTokenAlreadyUsed);
    require!(
        vault.status == VaultSettlementStatus::Escrowed
            || (vault.status == VaultSettlementStatus::Leased && now > vault.lease_expiry_ts),
        TsnError::InvalidVaultSettlementState
    );

    vault.status = VaultSettlementStatus::Leased;
    vault.lease_cranker = cranker.key();
    vault.lease_expiry_ts = now
        .checked_add(mother_escrow.lease_seconds)
        .ok_or(TsnError::IntentNotClaimable)?;
    vault.otdt_hash = otdt_hash;

    cranker.claim_credits = cranker.claim_credits.saturating_sub(1);
    cranker.total_claims = cranker.total_claims.saturating_add(1);
    cranker.last_active_ts = now;

    emit!(TsnSettlementLeaseClaimed {
        vault: vault.key(),
        cranker: cranker.key(),
        otdt_hash,
        lease_expiry_ts: vault.lease_expiry_ts,
    });
    Ok(())
}
