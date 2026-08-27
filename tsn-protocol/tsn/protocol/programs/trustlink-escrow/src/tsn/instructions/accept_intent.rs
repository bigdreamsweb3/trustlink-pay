use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use crate::tsn::{constants::TSN_MOTHER_ESCROW_SEED, errors::TsnError, state::{AcceptedIntentStatus, AcceptedIntentV1, MotherEscrow}};

pub const ACCEPTED_INTENT_SEED: &[u8] = b"tsn:accepted-intent:v1";
pub const ACCEPTED_INTENT_ROOT_DOMAIN: &[u8] = b"TSN_ACCEPTED_INTENT_ROOT_V1";
pub const REPLAY_NONCE_DOMAIN: &[u8] = b"TSN_CONFIDENTIAL_SETTLEMENT_REPLAY_NONCE_V1";
pub const GPRU_SCOPE_DOMAIN: &[u8] = b"TSN_CONFIDENTIAL_SETTLEMENT_GPRU_SCOPE_V1";
pub const SETTLEMENT_COMMITMENT_DOMAIN: &[u8] = b"TSN_CONFIDENTIAL_SETTLEMENT_COMMITMENT_V1";
pub const NULLIFIER_DOMAIN: &[u8] = b"TSN_CONFIDENTIAL_SETTLEMENT_NULLIFIER_V1";

/// `hashv` input order for the single-intent root is:
/// domain || epoch_id(le) || intent_commitment || amount(le) || token_id(le)
/// || tip_root_commitment || settlement_commitment || asset_commitment
/// || policy_commitment || gpru_scope_commitment || replay_nonce || nullifier
/// || valid_after_slot(le) || expires_at_slot(le).

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct AcceptIntentArgs {
    pub epoch_id: u64,
    pub intent_commitment: [u8; 32],
    pub amount: u64,
    pub token_id: u32,
    pub tip_root_commitment: [u8; 32],
    pub settlement_commitment: [u8; 32],
    pub asset_commitment: [u8; 32],
    pub policy_commitment: [u8; 32],
    pub gpru_scope_commitment: [u8; 32],
    pub replay_nonce: [u8; 32],
    pub nullifier: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
}

#[derive(Accounts)]
#[instruction(args: AcceptIntentArgs)]
pub struct AcceptIntent<'info> {
    #[account(mut)] pub authority: Signer<'info>,
    #[account(seeds = [TSN_MOTHER_ESCROW_SEED], bump = mother_escrow.bump, constraint = mother_escrow.authority == authority.key() @ TsnError::Unauthorized)]
    pub mother_escrow: Account<'info, MotherEscrow>,
    #[account(init, payer = authority, space = AcceptedIntentV1::SPACE, seeds = [ACCEPTED_INTENT_SEED, mother_escrow.key().as_ref(), &args.epoch_id.to_le_bytes(), args.intent_commitment.as_ref()], bump)]
    pub accepted_intent: Account<'info, AcceptedIntentV1>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AcceptIntent>, args: AcceptIntentArgs) -> Result<()> {
    require!(args.epoch_id == ctx.accounts.mother_escrow.epoch_id, TsnError::Unauthorized);
    require!(args.amount > 0 && args.token_id > 0 && args.expires_at_slot >= args.valid_after_slot, TsnError::Unauthorized);
    require!(args.intent_commitment != [0; 32] && args.tip_root_commitment != [0; 32], TsnError::Unauthorized);
    require!(args.replay_nonce != [0; 32], TsnError::Unauthorized);
    require!(args.gpru_scope_commitment == derive_gpru_scope_commitment(&args), TsnError::Unauthorized);
    require!(args.nullifier == derive_settlement_nullifier(&args), TsnError::Unauthorized);
    require!(args.settlement_commitment == derive_settlement_commitment(&args), TsnError::Unauthorized);
    let root = hashv(&[
        ACCEPTED_INTENT_ROOT_DOMAIN, &args.epoch_id.to_le_bytes(), &args.intent_commitment,
        &args.amount.to_le_bytes(), &args.token_id.to_le_bytes(), &args.tip_root_commitment,
        &args.settlement_commitment, &args.asset_commitment, &args.policy_commitment,
        &args.gpru_scope_commitment, &args.replay_nonce, &args.nullifier,
        &args.valid_after_slot.to_le_bytes(), &args.expires_at_slot.to_le_bytes(),
    ]).to_bytes();
    let out = &mut ctx.accounts.accepted_intent;
    out.version = AcceptedIntentV1::VERSION; out.epoch_id = args.epoch_id; out.intent_commitment = args.intent_commitment;
    out.amount = args.amount; out.token_id = args.token_id; out.tip_root_commitment = args.tip_root_commitment;
    out.settlement_commitment = args.settlement_commitment; out.asset_commitment = args.asset_commitment;
    out.policy_commitment = args.policy_commitment; out.gpru_scope_commitment = args.gpru_scope_commitment;
    out.replay_nonce = args.replay_nonce; out.nullifier = args.nullifier; out.valid_after_slot = args.valid_after_slot;
    out.expires_at_slot = args.expires_at_slot; out.accepted_intent_root = root; out.status = AcceptedIntentStatus::Accepted;
    out.mother_escrow = ctx.accounts.mother_escrow.key(); out.bump = ctx.bumps.accepted_intent;
    Ok(())
}

pub fn derive_accepted_intent_root(args: &AcceptIntentArgs) -> [u8; 32] {
    hashv(&[ACCEPTED_INTENT_ROOT_DOMAIN, &args.epoch_id.to_le_bytes(), &args.intent_commitment, &args.amount.to_le_bytes(), &args.token_id.to_le_bytes(), &args.tip_root_commitment, &args.settlement_commitment, &args.asset_commitment, &args.policy_commitment, &args.gpru_scope_commitment, &args.replay_nonce, &args.nullifier, &args.valid_after_slot.to_le_bytes(), &args.expires_at_slot.to_le_bytes()]).to_bytes()
}

pub fn derive_gpru_scope_commitment(args: &AcceptIntentArgs) -> [u8; 32] {
    hashv(&[
        GPRU_SCOPE_DOMAIN, &args.epoch_id.to_le_bytes(), &args.intent_commitment,
        &args.amount.to_le_bytes(), &args.token_id.to_le_bytes(), &args.tip_root_commitment,
        &args.policy_commitment, &args.replay_nonce, &args.valid_after_slot.to_le_bytes(),
        &args.expires_at_slot.to_le_bytes(),
    ]).to_bytes()
}

pub fn derive_settlement_nullifier(args: &AcceptIntentArgs) -> [u8; 32] {
    hashv(&[
        NULLIFIER_DOMAIN, &args.epoch_id.to_le_bytes(), &args.intent_commitment,
        &args.tip_root_commitment, &args.replay_nonce,
    ]).to_bytes()
}

pub fn derive_settlement_commitment(args: &AcceptIntentArgs) -> [u8; 32] {
    hashv(&[
        SETTLEMENT_COMMITMENT_DOMAIN, &args.epoch_id.to_le_bytes(), &args.intent_commitment,
        &args.amount.to_le_bytes(), &args.token_id.to_le_bytes(), &args.tip_root_commitment,
        &args.asset_commitment, &args.policy_commitment, &args.gpru_scope_commitment,
        &args.replay_nonce, &args.nullifier, &args.valid_after_slot.to_le_bytes(),
        &args.expires_at_slot.to_le_bytes(),
    ]).to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args() -> AcceptIntentArgs {
        AcceptIntentArgs {
            epoch_id: 7,
            intent_commitment: [1; 32],
            amount: 100,
            token_id: 2,
            tip_root_commitment: [3; 32],
            settlement_commitment: [0; 32],
            asset_commitment: [4; 32],
            policy_commitment: [5; 32],
            gpru_scope_commitment: [0; 32],
            replay_nonce: [6; 32],
            nullifier: [0; 32],
            valid_after_slot: 10,
            expires_at_slot: 20,
        }
    }

    #[test]
    fn confidential_fields_are_deterministic_and_bound() {
        let mut value = args();
        value.gpru_scope_commitment = derive_gpru_scope_commitment(&value);
        value.nullifier = derive_settlement_nullifier(&value);
        value.settlement_commitment = derive_settlement_commitment(&value);
        assert_ne!(value.gpru_scope_commitment, [0; 32]);
        assert_ne!(value.nullifier, [0; 32]);
        assert_ne!(value.settlement_commitment, [0; 32]);
        let mut changed = value;
        changed.amount += 1;
        assert_ne!(value.gpru_scope_commitment, derive_gpru_scope_commitment(&changed));
        assert_ne!(value.nullifier, derive_settlement_nullifier(&changed));
    }
}
