use anchor_lang::prelude::*;

use crate::authority::{derive_tsn_authorization_signer, TCAP_TIN_TIP_V1_SEED};
use crate::error::TcapError;
use crate::events::TcapTinTipCreditedV1;
use crate::state::{TCapTinTipV1, TcapAssetEntryV1, TcapAssetStatusV1, TcapGlobalConfigV1, TcapRiskStateV1};

/// Privacy-preserving GPRU credit authorization.
///
/// This is deliberately not bound to a TSN intent, settlement commitment,
/// epoch root, receipt PDA, or per-transfer nullifier account. Replay safety
/// comes from the monotonic TIN tip sequence and previous commitment. The
/// authorization signer is a TSN PDA, so this instruction can only be reached
/// through the approved TSN program's CPI signer path.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct CreditTcapTinTipV2Args {
    pub authorization_digest: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
    pub sequence: u64,
    pub token_id: u32,
    pub policy_commitment: [u8; 32],
    pub gpru_scope_commitment: [u8; 32],
    pub nullifier: [u8; 32],
}

#[derive(Accounts)]
#[instruction(args: CreditTcapTinTipV2Args)]
pub struct CreditTcapTinTipV2<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [crate::authority::TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(mut, seeds = [TCAP_TIN_TIP_V1_SEED, tip_root.key().as_ref()], bump = tin_tip.bump)]
    pub tin_tip: Account<'info, TCapTinTipV1>,
    /// CHECK: The blinded root is a PDA seed and is never stored or emitted.
    pub tip_root: UncheckedAccount<'info>,
    #[account(
        seeds = [crate::authority::TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump,
    )]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    /// CHECK: The TSN program is authenticated by the governance-bound config.
    #[account(executable, address = config.approved_tsn_program @ TcapError::InvalidTsnProgram)]
    pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: This PDA can only be a signer when the approved TSN program signs
    /// the CPI. It is derived from the opaque authorization digest.
    pub tsn_authorization_signer: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<CreditTcapTinTipV2>, args: CreditTcapTinTipV2Args) -> Result<()> {
    require!(args.authorization_digest != [0; 32], TcapError::EmptyCommitment);
    require!(args.previous_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.new_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.policy_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.gpru_scope_commitment != [0; 32], TcapError::InvalidGpruScope);
    require!(args.nullifier != [0; 32], TcapError::EmptyCommitment);
    require!(args.sequence == ctx.accounts.tin_tip.sequence.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidTipSequence);
    require!(args.previous_commitment == ctx.accounts.tin_tip.current_commitment, TcapError::TipCommitmentMismatch);
    require!(args.policy_commitment == ctx.accounts.tin_tip.policy_commitment, TcapError::TipCommitmentMismatch);
    require!(args.nullifier != ctx.accounts.tin_tip.last_transition_nullifier, TcapError::NullifierAlreadyConsumed);
    require!(!ctx.accounts.tin_tip.frozen, TcapError::TipFrozen);

    let asset = &ctx.accounts.asset_entry;
    require!(asset.token_id == args.token_id, TcapError::WrongAsset);
    require!(matches!(asset.status, TcapAssetStatusV1::Active) && matches!(asset.risk_state, TcapRiskStateV1::Approved), TcapError::AssetUnavailable);
    require!(!asset.paused && !asset.deprecated, TcapError::AssetUnavailable);

    let (expected_signer, _) = derive_tsn_authorization_signer(&ctx.accounts.config.approved_tsn_program, &args.authorization_digest);
    require_keys_eq!(expected_signer, ctx.accounts.tsn_authorization_signer.key(), TcapError::InvalidTsnAuthorizationSigner);
    let clock = Clock::get()?;
    require!(clock.slot >= args.valid_after_slot && clock.slot <= args.expires_at_slot, TcapError::AuthorizationExpired);

    let transition_digest = anchor_lang::solana_program::hash::hashv(&[
        b"TCAP_TIN_TIP_CREDIT_V2",
        ctx.accounts.tin_tip.key().as_ref(),
        &args.authorization_digest,
        args.previous_commitment.as_ref(),
        args.new_commitment.as_ref(),
        &args.sequence.to_le_bytes(),
        &args.token_id.to_le_bytes(),
        args.gpru_scope_commitment.as_ref(),
        args.nullifier.as_ref(),
    ]).to_bytes();
    ctx.accounts.tin_tip.current_commitment = args.new_commitment;
    ctx.accounts.tin_tip.sequence = args.sequence;
    ctx.accounts.tin_tip.last_transition_nullifier = args.nullifier;
    emit!(TcapTinTipCreditedV1 {
        tin_tip: ctx.accounts.tin_tip.key(),
        sequence: args.sequence,
        token_id: args.token_id,
        transition_digest,
    });
    Ok(())
}
