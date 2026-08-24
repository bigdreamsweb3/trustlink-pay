use anchor_lang::prelude::*;

use crate::authority::{TCAP_NULLIFIER_SEED, TCAP_TIN_TIP_V1_SEED, TCAP_TSN_AUTH_RECEIPT_SEED};
use crate::error::TcapError;
use crate::events::TcapTinTipCreditedV1;
use crate::state::{
    NullifierDomainV1, NullifierRecordV1, TCapTinTipV1, TcapAssetEntryV1, TcapAssetStatusV1,
    TcapGlobalConfigV1, TcapRiskStateV1, TcapTransitionTypeV1, TsnAuthorizationReceiptV1,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct CreditTcapTinTipV1Args {
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
    pub sequence: u64,
    pub token_id: u32,
    pub policy_commitment: [u8; 32],
    pub gpru_scope_commitment: [u8; 32],
    pub nullifier: [u8; 32],
}

#[derive(Accounts)]
#[instruction(args: CreditTcapTinTipV1Args)]
pub struct CreditTcapTinTipV1<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [crate::authority::TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(
        mut,
        seeds = [TCAP_TIN_TIP_V1_SEED, tip_root.key().as_ref()],
        bump = tin_tip.bump,
    )]
    pub tin_tip: Account<'info, TCapTinTipV1>,
    /// CHECK: The blinded root is only a PDA seed and is never stored or emitted.
    pub tip_root: UncheckedAccount<'info>,
    #[account(
        seeds = [crate::authority::TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump,
    )]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(
        mut,
        seeds = [TCAP_TSN_AUTH_RECEIPT_SEED, authorization_receipt.authorization_digest.as_ref()],
        bump = authorization_receipt.bump,
        constraint = authorization_receipt.config == config.key() @ TcapError::InvalidTipAuthorization,
    )]
    pub authorization_receipt: Account<'info, TsnAuthorizationReceiptV1>,
    #[account(
        init_if_needed,
        payer = payer,
        space = NullifierRecordV1::SPACE,
        seeds = [TCAP_NULLIFIER_SEED, args.nullifier.as_ref()],
        bump,
    )]
    pub nullifier_record: Account<'info, NullifierRecordV1>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreditTcapTinTipV1>, args: CreditTcapTinTipV1Args) -> Result<()> {
    validate_tip_transition(&ctx.accounts.tin_tip, &args)?;
    require!(
        args.gpru_scope_commitment != [0; 32],
        TcapError::InvalidGpruScope
    );
    require!(args.nullifier != [0; 32], TcapError::EmptyCommitment);
    require!(!ctx.accounts.tin_tip.frozen, TcapError::TipFrozen);

    let asset = &ctx.accounts.asset_entry;
    require!(asset.token_id == args.token_id, TcapError::WrongAsset);
    require!(
        matches!(asset.status, TcapAssetStatusV1::Active),
        TcapError::AssetUnavailable
    );
    require!(
        matches!(asset.risk_state, TcapRiskStateV1::Approved),
        TcapError::AssetUnavailable
    );
    require!(
        !asset.paused && !asset.deprecated,
        TcapError::AssetUnavailable
    );

    let clock = Clock::get()?;
    let receipt = &mut ctx.accounts.authorization_receipt;
    validate_credit_receipt(receipt, ctx.accounts.tin_tip.key(), &args, clock.slot)?;

    let record = &mut ctx.accounts.nullifier_record;
    if record.registry == Pubkey::default() {
        record.version = crate::TCAP_STATE_VERSION_V1;
        record.registry = ctx.accounts.config.key();
        record.shard = Pubkey::default();
        record.domain = NullifierDomainV1::FundedIntentSettlement;
        record.nullifier = args.nullifier;
        record.epoch_id = receipt.epoch_id;
        record.consumed = false;
        record.creation_authority = ctx.accounts.payer.key();
        record.bump = ctx.bumps.nullifier_record;
    }
    require!(
        record.registry == ctx.accounts.config.key(),
        TcapError::InvalidPda
    );
    require!(
        matches!(record.domain, NullifierDomainV1::FundedIntentSettlement),
        TcapError::InvalidTipAuthorization
    );
    require!(
        record.nullifier == args.nullifier && record.epoch_id == receipt.epoch_id,
        TcapError::InvalidTipAuthorization
    );
    require!(!record.consumed, TcapError::NullifierAlreadyConsumed);

    let digest = anchor_lang::solana_program::hash::hashv(&[
        b"TCAP_TIN_TIP_CREDIT_V1",
        ctx.accounts.tin_tip.key().as_ref(),
        args.previous_commitment.as_ref(),
        args.new_commitment.as_ref(),
        &args.sequence.to_le_bytes(),
        &args.token_id.to_le_bytes(),
        args.nullifier.as_ref(),
    ])
    .to_bytes();
    ctx.accounts.tin_tip.current_commitment = args.new_commitment;
    ctx.accounts.tin_tip.sequence = args.sequence;
    ctx.accounts.tin_tip.last_transition_nullifier = args.nullifier;
    record.consumed = true;
    receipt.consumed = true;
    emit!(TcapTinTipCreditedV1 {
        tin_tip: ctx.accounts.tin_tip.key(),
        sequence: args.sequence,
        token_id: args.token_id,
        transition_digest: digest
    });
    Ok(())
}

fn validate_credit_receipt(
    receipt: &TsnAuthorizationReceiptV1,
    tin_tip: Pubkey,
    args: &CreditTcapTinTipV1Args,
    current_slot: u64,
) -> Result<()> {
    require!(!receipt.consumed, TcapError::InvalidTipAuthorization);
    require!(
        matches!(
            receipt.transition_type,
            TcapTransitionTypeV1::ConfidentialSettlement
        ),
        TcapError::InvalidSettlementMode
    );
    require!(
        receipt.tin_tip == tin_tip,
        TcapError::InvalidTipAuthorization
    );
    require!(
        receipt.previous_commitment == args.previous_commitment
            && receipt.new_commitment == args.new_commitment,
        TcapError::TipCommitmentMismatch
    );
    require!(
        receipt.sequence == args.sequence && receipt.token_id == args.token_id,
        TcapError::InvalidTipAuthorization
    );
    require!(
        receipt.policy_commitment == args.policy_commitment
            && receipt.gpru_scope_commitment == args.gpru_scope_commitment,
        TcapError::InvalidGpruScope
    );
    require!(
        receipt.nullifier == args.nullifier,
        TcapError::InvalidTipAuthorization
    );
    require!(
        current_slot >= receipt.valid_after_slot && current_slot <= receipt.expires_at_slot,
        TcapError::AuthorizationExpired
    );
    Ok(())
}

fn validate_tip_transition(tip: &TCapTinTipV1, args: &CreditTcapTinTipV1Args) -> Result<()> {
    require!(
        tip.version == crate::TCAP_STATE_VERSION_V1,
        TcapError::InvalidPda
    );
    require!(!tip.frozen, TcapError::TipFrozen);
    require!(
        args.previous_commitment != [0; 32],
        TcapError::EmptyCommitment
    );
    require!(args.new_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(
        args.policy_commitment != [0; 32],
        TcapError::EmptyCommitment
    );
    require!(
        args.sequence
            == tip
                .sequence
                .checked_add(1)
                .ok_or(TcapError::ArithmeticOverflow)?,
        TcapError::InvalidTipSequence
    );
    require!(
        args.previous_commitment == tip.current_commitment,
        TcapError::TipCommitmentMismatch
    );
    require!(
        args.policy_commitment == tip.policy_commitment,
        TcapError::TipCommitmentMismatch
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tip() -> TCapTinTipV1 {
        TCapTinTipV1 {
            version: crate::TCAP_STATE_VERSION_V1,
            current_commitment: [1; 32],
            sequence: 4,
            policy_commitment: [2; 32],
            last_transition_nullifier: [0; 32],
            frozen: false,
            bump: 1,
        }
    }

    #[test]
    fn accepts_next_credit_sequence_and_previous_commitment() {
        let args = CreditTcapTinTipV1Args {
            previous_commitment: [1; 32],
            new_commitment: [3; 32],
            sequence: 5,
            token_id: 7,
            policy_commitment: [2; 32],
            gpru_scope_commitment: [4; 32],
            nullifier: [5; 32],
        };
        assert!(validate_tip_transition(&tip(), &args).is_ok());
    }

    #[test]
    fn rejects_replay_or_wrong_previous_commitment() {
        let args = CreditTcapTinTipV1Args {
            previous_commitment: [9; 32],
            new_commitment: [3; 32],
            sequence: 5,
            token_id: 7,
            policy_commitment: [2; 32],
            gpru_scope_commitment: [4; 32],
            nullifier: [5; 32],
        };
        assert!(validate_tip_transition(&tip(), &args).is_err());
        let mut replay = args;
        replay.previous_commitment = [1; 32];
        replay.sequence = 4;
        assert!(validate_tip_transition(&tip(), &replay).is_err());
    }

    fn receipt(tip: Pubkey) -> TsnAuthorizationReceiptV1 {
        TsnAuthorizationReceiptV1 {
            version: 1,
            config: Pubkey::new_unique(),
            tsn_program_id: Pubkey::new_unique(),
            epoch_id: 1,
            intent_commitment: [11; 32],
            amount: 100,
            settlement_commitment: [12; 32],
            accepted_intent_root: [0; 32],
            previous_tcap_root: [0; 32],
            asset_commitment: [0; 32],
            authorization_digest: [1; 32],
            replay_nonce: [2; 32],
            tin_tip: tip,
            previous_commitment: [1; 32],
            new_commitment: [3; 32],
            sequence: 5,
            token_id: 7,
            policy_commitment: [2; 32],
            gpru_scope_commitment: [4; 32],
            nullifier: [5; 32],
            transition_type: TcapTransitionTypeV1::ConfidentialSettlement,
            valid_after_slot: 10,
            expires_at_slot: 20,
            non_spendable: true,
            consumed: false,
            bump: 1,
        }
    }

    fn args() -> CreditTcapTinTipV1Args {
        CreditTcapTinTipV1Args {
            previous_commitment: [1; 32],
            new_commitment: [3; 32],
            sequence: 5,
            token_id: 7,
            policy_commitment: [2; 32],
            gpru_scope_commitment: [4; 32],
            nullifier: [5; 32],
        }
    }

    #[test]
    fn complete_confidential_receipt_can_be_consumed_by_credit() {
        let tip = Pubkey::new_unique();
        assert!(validate_credit_receipt(&receipt(tip), tip, &args(), 15).is_ok());
    }

    #[test]
    fn wrong_transition_or_incomplete_receipt_fails() {
        let tip = Pubkey::new_unique();
        let mut wrong_transition = receipt(tip);
        wrong_transition.transition_type = TcapTransitionTypeV1::AuthorizationOnly;
        assert!(validate_credit_receipt(&wrong_transition, tip, &args(), 15).is_err());
        let mut incomplete = receipt(tip);
        incomplete.gpru_scope_commitment = [0; 32];
        assert!(validate_credit_receipt(&incomplete, tip, &args(), 15).is_err());
    }

    #[test]
    fn consumed_receipt_cannot_be_replayed() {
        let tip = Pubkey::new_unique();
        let mut used = receipt(tip);
        used.consumed = true;
        assert!(validate_credit_receipt(&used, tip, &args(), 15).is_err());
    }
}
