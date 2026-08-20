use anchor_lang::prelude::*;
use crate::tsn::{constants::TSN_SETTLEMENT_DNA_SEED, errors::TsnError, state::{MotherEscrow, SettlementDna, SettlementDnaStatus}};

#[derive(Accounts)]
#[instruction(slot: [u8; 32], lease_version: u64)]
pub struct CreateSettlementDna<'info> {
    #[account(mut, address = mother_escrow.authority)] pub authority: Signer<'info>,
    pub mother_escrow: Account<'info, MotherEscrow>,
    #[account(init_if_needed, payer = authority, space = SettlementDna::SPACE, seeds = [TSN_SETTLEMENT_DNA_SEED, mother_escrow.key().as_ref(), slot.as_ref()], bump)]
    pub settlement_dna: Account<'info, SettlementDna>,
    pub system_program: Program<'info, System>,
}

pub fn create_settlement_dna(ctx: Context<CreateSettlementDna>, slot: [u8; 32], lease_version: u64, commitment_digest: [u8; 32], settlement_commitment: [u8; 32], payout_nullifier: [u8; 32], random_nonce: [u8; 32], cranker: Pubkey, cranker_vault: Pubkey, recipient: Pubkey, token_mint: Pubkey, amount: u64, lease_id_hash: [u8; 32], lease_expiry_ts: i64, authorization_expiry_ts: i64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(slot != [0; 32] && commitment_digest != [0; 32] && settlement_commitment != [0; 32] && payout_nullifier != [0; 32] && amount > 0, TsnError::InvalidPrivateCommitment);
    require!(authorization_expiry_ts > now && authorization_expiry_ts <= lease_expiry_ts, TsnError::PermitExpired);
    let dna = &mut ctx.accounts.settlement_dna;
    let fresh = dna.mother_escrow == Pubkey::default();
    require!(fresh || (dna.status == SettlementDnaStatus::Active && now > dna.lease_expiry_ts), TsnError::InvalidPrivateCommitment);
    dna.mother_escrow = ctx.accounts.mother_escrow.key(); dna.slot = slot; dna.commitment_digest = commitment_digest; dna.settlement_commitment = settlement_commitment; dna.payout_nullifier = payout_nullifier; dna.random_nonce = random_nonce; dna.cranker = cranker; dna.cranker_vault = cranker_vault; dna.recipient = recipient; dna.token_mint = token_mint; dna.amount = amount; dna.lease_id_hash = lease_id_hash; dna.lease_version = lease_version; dna.lease_expiry_ts = lease_expiry_ts; dna.authorization_expiry_ts = authorization_expiry_ts; dna.status = SettlementDnaStatus::Active; dna.bump = ctx.bumps.settlement_dna;
    Ok(())
}
