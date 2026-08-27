use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

use crate::tsn::{
    constants::{TSN_EPOCH_COMMITMENT_V1_SEED, TSN_MOTHER_ESCROW_SEED, TSN_TCAP_AUTHORITY_SEED},
    errors::TsnError,
    state::{AcceptedIntentStatus, AcceptedIntentV1, EpochCommitmentStateV1, MotherEscrow},
};

pub const TCAP_PROGRAM_ID: Pubkey = pubkey!("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct RegisterTcapCreditAuthorizationArgs {
    pub version: u16,
    pub tsn_program_id: Pubkey,
    pub epoch_id: u64,
    pub intent_commitment: [u8; 32],
    pub amount: u64,
    pub settlement_commitment: [u8; 32],
    pub accepted_intent_root: [u8; 32],
    pub previous_tcap_root: [u8; 32],
    pub transition_type: u8,
    pub asset_commitment: [u8; 32],
    pub authorization_digest: [u8; 32],
    pub verifier_domain_version: u16,
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub replay_nonce: [u8; 32],
    pub tin_tip: Pubkey,
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
    pub sequence: u64,
    pub token_id: u32,
    pub policy_commitment: [u8; 32],
    pub gpru_scope_commitment: [u8; 32],
    pub nullifier: [u8; 32],
}

/// Wire ABI shared with TCap's `TsnSettlementAuthorizationV1`.  The enum is
/// encoded as one byte by Anchor/Borsh; value 1 is ConfidentialSettlement.
const CONFIDENTIAL_SETTLEMENT_V1: u8 = 1;
const AUTHORIZATION_DIGEST_DOMAIN: &[u8] = b"TSN_CONFIDENTIAL_SETTLEMENT_AUTHORIZATION_V1";

#[derive(Accounts)]
#[instruction(args: RegisterTcapCreditAuthorizationArgs)]
pub struct RegisterTcapCreditAuthorization<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [TSN_MOTHER_ESCROW_SEED], bump = mother_escrow.bump, constraint = mother_escrow.authority == authority.key() @ TsnError::Unauthorized)]
    pub mother_escrow: Account<'info, MotherEscrow>,
    /// CHECK: constrained to the deployed TCap program below.
    #[account(executable, address = TCAP_PROGRAM_ID)]
    pub tcap_program: UncheckedAccount<'info>,
    /// CHECK: validated by the TCap program.
    pub tcap_config: UncheckedAccount<'info>,
    /// CHECK: validated by the TCap program.
    pub tcap_asset_entry: UncheckedAccount<'info>,
    /// CHECK: validated by the TCap program.
    pub tcap_reserve_state: UncheckedAccount<'info>,
    /// CHECK: validated by the TCap program.
    pub tcap_commitment_root: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = EpochCommitmentStateV1::SPACE,
        seeds = [TSN_EPOCH_COMMITMENT_V1_SEED, mother_escrow.key().as_ref(), &args.epoch_id.to_le_bytes()],
        bump,
    )]
    pub tsn_epoch_commitment: Account<'info, EpochCommitmentStateV1>,
    /// CHECK: PDA created by TCap.
    #[account(mut)]
    pub tcap_authorization_receipt: UncheckedAccount<'info>,
    #[account(
        seeds = [crate::tsn::instructions::accept_intent::ACCEPTED_INTENT_SEED,
            mother_escrow.key().as_ref(), &args.epoch_id.to_le_bytes(), args.intent_commitment.as_ref()],
        bump = accepted_intent.bump,
    )]
    pub accepted_intent: Account<'info, AcceptedIntentV1>,
    /// CHECK: TSN-owned PDA signer for the TCap authorization.
    pub tcap_authorization_signer: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn register_tcap_credit_authorization(
    ctx: Context<RegisterTcapCreditAuthorization>,
    args: RegisterTcapCreditAuthorizationArgs,
) -> Result<()> {
    require!(
        args.version == 1
            && args.tsn_program_id == crate::ID
            && args.transition_type == CONFIDENTIAL_SETTLEMENT_V1,
        TsnError::Unauthorized
    );
    require!(
        args.authorization_digest != [0; 32] && args.replay_nonce != [0; 32],
        TsnError::Unauthorized
    );
    require!(args.authorization_digest == derive_authorization_digest(&args), TsnError::Unauthorized);
    require!(ctx.accounts.accepted_intent.epoch_id == args.epoch_id
        && ctx.accounts.accepted_intent.intent_commitment == args.intent_commitment
        && ctx.accounts.accepted_intent.amount == args.amount
        && ctx.accounts.accepted_intent.settlement_commitment == args.settlement_commitment
        && ctx.accounts.accepted_intent.token_id == args.token_id
        && Pubkey::find_program_address(
            &[b"tcap:tin-tip:v1", &ctx.accounts.accepted_intent.tip_root_commitment],
            &TCAP_PROGRAM_ID,
        ).0 == args.tin_tip
        && ctx.accounts.accepted_intent.asset_commitment == args.asset_commitment
        && ctx.accounts.accepted_intent.policy_commitment == args.policy_commitment
        && ctx.accounts.accepted_intent.gpru_scope_commitment == args.gpru_scope_commitment
        && ctx.accounts.accepted_intent.replay_nonce == args.replay_nonce
        && ctx.accounts.accepted_intent.nullifier == args.nullifier
        && ctx.accounts.accepted_intent.valid_after_slot == args.valid_after_slot
        && ctx.accounts.accepted_intent.expires_at_slot == args.expires_at_slot
        && ctx.accounts.accepted_intent.accepted_intent_root == args.accepted_intent_root
        && ctx.accounts.accepted_intent.mother_escrow == ctx.accounts.mother_escrow.key()
        && matches!(ctx.accounts.accepted_intent.status, AcceptedIntentStatus::Accepted), TsnError::Unauthorized);
    require!(
        args.tin_tip != Pubkey::default() && args.new_commitment != [0; 32],
        TsnError::Unauthorized
    );
    require!(
        args.previous_commitment != [0; 32]
            && args.policy_commitment != [0; 32]
            && args.gpru_scope_commitment != [0; 32]
            && args.nullifier != [0; 32]
            && args.sequence > 0
            && args.token_id > 0
            && args.expires_at_slot >= args.valid_after_slot,
        TsnError::Unauthorized
    );
    let epoch = &mut ctx.accounts.tsn_epoch_commitment;
    if epoch.mother_escrow == Pubkey::default() {
        epoch.version = EpochCommitmentStateV1::VERSION;
        epoch.epoch_id = args.epoch_id;
        epoch.accepted_intent_root = args.accepted_intent_root;
        epoch.previous_tcap_state_root = args.previous_tcap_root;
        epoch.mother_escrow = ctx.accounts.mother_escrow.key();
        epoch.bump = ctx.bumps.tsn_epoch_commitment;
    }
    require!(
        epoch.version == EpochCommitmentStateV1::VERSION
            && epoch.epoch_id == args.epoch_id
            && epoch.mother_escrow == ctx.accounts.mother_escrow.key()
            && epoch.accepted_intent_root == args.accepted_intent_root
            && epoch.previous_tcap_state_root == args.previous_tcap_root,
        TsnError::Unauthorized
    );
    let (expected_signer, signer_bump) = Pubkey::find_program_address(
        &[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest],
        &crate::ID,
    );
    require_keys_eq!(
        expected_signer,
        ctx.accounts.tcap_authorization_signer.key(),
        TsnError::Unauthorized
    );

    let mut data = anchor_lang::solana_program::hash::hash(b"global:register_tsn_authorization_v1")
        .to_bytes()[..8]
        .to_vec();
    data.extend_from_slice(&args.try_to_vec()?);
    let instruction = Instruction {
        program_id: TCAP_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(ctx.accounts.authority.key(), true),
            AccountMeta::new_readonly(ctx.accounts.tcap_config.key(), false),
            AccountMeta::new_readonly(ctx.accounts.tcap_asset_entry.key(), false),
            AccountMeta::new_readonly(ctx.accounts.tcap_reserve_state.key(), false),
            AccountMeta::new_readonly(ctx.accounts.tcap_commitment_root.key(), false),
            AccountMeta::new_readonly(crate::ID, false),
            AccountMeta::new_readonly(ctx.accounts.tsn_epoch_commitment.key(), false),
            AccountMeta::new_readonly(ctx.accounts.tcap_authorization_signer.key(), true),
            AccountMeta::new_readonly(ctx.accounts.accepted_intent.key(), false),
            AccountMeta::new(ctx.accounts.tcap_authorization_receipt.key(), false),
            AccountMeta::new_readonly(anchor_lang::solana_program::system_program::ID, false),
        ],
        data,
    };
    invoke_signed(
        &instruction,
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.tcap_config.to_account_info(),
            ctx.accounts.tcap_asset_entry.to_account_info(),
            ctx.accounts.tcap_reserve_state.to_account_info(),
            ctx.accounts.tcap_commitment_root.to_account_info(),
            ctx.accounts.tcap_program.to_account_info(),
            ctx.accounts.tsn_epoch_commitment.to_account_info(),
            ctx.accounts.tcap_authorization_signer.to_account_info(),
            ctx.accounts.accepted_intent.to_account_info(),
            ctx.accounts.tcap_authorization_receipt.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[&[
            TSN_TCAP_AUTHORITY_SEED,
            &args.authorization_digest,
            &[signer_bump],
        ]],
    )?;
    ctx.accounts.accepted_intent.status = AcceptedIntentStatus::Consumed;
    Ok(())
}

/// Canonical digest for the TSN→TCAP receipt. Every value that TCAP validates
/// is included so a receipt cannot be rebound to another tip, amount or asset.
pub fn derive_authorization_digest(args: &RegisterTcapCreditAuthorizationArgs) -> [u8; 32] {
    anchor_lang::solana_program::hash::hashv(&[
        AUTHORIZATION_DIGEST_DOMAIN,
        &args.version.to_le_bytes(),
        args.tsn_program_id.as_ref(),
        &args.epoch_id.to_le_bytes(),
        &args.intent_commitment,
        &args.amount.to_le_bytes(),
        &args.settlement_commitment,
        &args.accepted_intent_root,
        &args.previous_tcap_root,
        &[args.transition_type],
        &args.asset_commitment,
        &args.verifier_domain_version.to_le_bytes(),
        &args.valid_after_slot.to_le_bytes(),
        &args.expires_at_slot.to_le_bytes(),
        &args.replay_nonce,
        args.tin_tip.as_ref(),
        &args.previous_commitment,
        &args.new_commitment,
        &args.sequence.to_le_bytes(),
        &args.token_id.to_le_bytes(),
        &args.policy_commitment,
        &args.gpru_scope_commitment,
        &args.nullifier,
    ]).to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confidential_settlement_abi_serializes_all_credit_fields() {
        let args = RegisterTcapCreditAuthorizationArgs {
            version: 1,
            tsn_program_id: crate::ID,
            epoch_id: 9,
            intent_commitment: [11; 32],
            amount: 100,
            settlement_commitment: [12; 32],
            accepted_intent_root: [1; 32],
            previous_tcap_root: [2; 32],
            transition_type: CONFIDENTIAL_SETTLEMENT_V1,
            asset_commitment: [3; 32],
            authorization_digest: [4; 32],
            verifier_domain_version: 1,
            valid_after_slot: 10,
            expires_at_slot: 20,
            replay_nonce: [5; 32],
            tin_tip: Pubkey::new_unique(),
            previous_commitment: [6; 32],
            new_commitment: [7; 32],
            sequence: 1,
            token_id: 2,
            policy_commitment: [8; 32],
            gpru_scope_commitment: [9; 32],
            nullifier: [10; 32],
        };
        let bytes = args.try_to_vec().unwrap();
        let decoded = RegisterTcapCreditAuthorizationArgs::try_from_slice(&bytes).unwrap();
        assert_eq!(decoded.transition_type, CONFIDENTIAL_SETTLEMENT_V1);
        assert_eq!(decoded.tin_tip, args.tin_tip);
        assert_eq!(decoded.previous_commitment, args.previous_commitment);
        assert_eq!(decoded.new_commitment, args.new_commitment);
        assert_eq!(decoded.sequence, args.sequence);
        assert_eq!(decoded.token_id, args.token_id);
        assert_eq!(decoded.policy_commitment, args.policy_commitment);
        assert_eq!(decoded.gpru_scope_commitment, args.gpru_scope_commitment);
        assert_eq!(decoded.nullifier, args.nullifier);
        assert_eq!(decoded.valid_after_slot, args.valid_after_slot);
        assert_eq!(decoded.expires_at_slot, args.expires_at_slot);
    }
}
