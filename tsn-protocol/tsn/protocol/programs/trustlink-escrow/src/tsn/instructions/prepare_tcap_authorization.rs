use anchor_lang::prelude::*;

use crate::tsn::{
    constants::{TSN_MOTHER_ESCROW_SEED, TSN_TCAP_AUTHORIZATION_SEED},
    errors::TsnError,
    state::{MotherEscrow, TsnTcapAuthorizationV1, TsnTcapTransitionTypeV1, TSN_TCAP_AUTHORIZATION_VERSION_V1},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct PrepareTcapAuthorizationArgsV1 {
    pub tcap_program_id: Pubkey,
    pub epoch_id: u64,
    pub accepted_intent_root: [u8; 32],
    pub previous_tcap_root: [u8; 32],
    pub asset_commitment: [u8; 32],
    pub authorization_digest: [u8; 32],
    pub replay_nonce: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
}

#[derive(Accounts)]
#[instruction(args: PrepareTcapAuthorizationArgsV1)]
pub struct PrepareTcapAuthorization<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [TSN_MOTHER_ESCROW_SEED],
        bump = mother_escrow.bump,
        has_one = authority,
    )]
    pub mother_escrow: Account<'info, MotherEscrow>,
    #[account(
        init,
        payer = authority,
        space = TsnTcapAuthorizationV1::SPACE,
        seeds = [TSN_TCAP_AUTHORIZATION_SEED, args.authorization_digest.as_ref()],
        bump,
    )]
    pub authorization: Account<'info, TsnTcapAuthorizationV1>,
    pub system_program: Program<'info, System>,
}

pub fn prepare_tcap_authorization(
    ctx: Context<PrepareTcapAuthorization>,
    args: PrepareTcapAuthorizationArgsV1,
) -> Result<()> {
    require!(args.tcap_program_id != Pubkey::default(), TsnError::InvalidTcapProgramId);
    require!(args.authorization_digest != [0; 32], TsnError::InvalidTcapAuthorizationDigest);
    require!(args.replay_nonce != [0; 32], TsnError::InvalidTcapAuthorizationDigest);
    require!(args.expires_at_slot >= args.valid_after_slot, TsnError::InvalidTcapAuthorizationWindow);

    let record = &mut ctx.accounts.authorization;
    record.version = TSN_TCAP_AUTHORIZATION_VERSION_V1;
    record.tcap_program_id = args.tcap_program_id;
    record.mother_escrow = ctx.accounts.mother_escrow.key();
    record.epoch_id = args.epoch_id;
    record.accepted_intent_root = args.accepted_intent_root;
    record.previous_tcap_root = args.previous_tcap_root;
    record.asset_commitment = args.asset_commitment;
    record.authorization_digest = args.authorization_digest;
    record.replay_nonce = args.replay_nonce;
    record.transition_type = TsnTcapTransitionTypeV1::AuthorizationOnly;
    record.valid_after_slot = args.valid_after_slot;
    record.expires_at_slot = args.expires_at_slot;
    record.non_spendable = true;
    record.bump = ctx.bumps.authorization;
    Ok(())
}

pub fn validate_tcap_authorization(record: &TsnTcapAuthorizationV1, slot: u64) -> Result<()> {
    require!(record.non_spendable, TsnError::InvalidTcapAuthorizationRecord);
    require!(record.is_valid_at(slot), TsnError::InvalidTcapAuthorizationWindow);
    Ok(())
}
