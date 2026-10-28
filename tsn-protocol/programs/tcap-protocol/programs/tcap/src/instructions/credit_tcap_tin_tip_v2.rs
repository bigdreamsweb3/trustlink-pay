use anchor_lang::prelude::*;

use crate::authority::{derive_tsn_authorization_signer, TCAP_TIN_TIP_V1_SEED};
use crate::error::TcapError;
use crate::events::TcapTinTipCreditedV1;
use crate::state::{TCapTinTipV1, TcapAssetEntryV1, TcapAssetStatusV1, TcapGlobalConfigV1, TcapRiskStateV1};

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
    pub dna_key_commitment: [u8; 32],
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
    /// CHECK: blinded route commitment used only to derive the TIP PDA.
    pub tip_root: UncheckedAccount<'info>,
    #[account(
        seeds = [crate::authority::TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump,
    )]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    /// CHECK: authenticated by TCAP config.
    #[account(executable, address = config.approved_tsn_program @ TcapError::InvalidTsnProgram)]
    pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: TSN PDA signer derived from the authorized digest.
    pub tsn_authorization_signer: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<CreditTcapTinTipV2>, args: CreditTcapTinTipV2Args) -> Result<()> {
    require!(args.authorization_digest != [0; 32], TcapError::EmptyCommitment);
    require!(args.previous_commitment != [0; 32] && args.new_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.policy_commitment != [0; 32] && args.gpru_scope_commitment != [0; 32], TcapError::InvalidGpruScope);
    require!(args.nullifier != [0; 32] && args.dna_key_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(!ctx.accounts.tin_tip.frozen, TcapError::TipFrozen);
    require!(args.policy_commitment == ctx.accounts.tin_tip.policy_commitment, TcapError::TipCommitmentMismatch);

    let asset = &ctx.accounts.asset_entry;
    require!(asset.token_id == args.token_id, TcapError::WrongAsset);
    require!(matches!(asset.status, TcapAssetStatusV1::Active) && matches!(asset.risk_state, TcapRiskStateV1::Approved), TcapError::AssetUnavailable);
    require!(!asset.paused && !asset.deprecated, TcapError::AssetUnavailable);

    let tin_tip_key = ctx.accounts.tin_tip.key();
    let tip = &mut ctx.accounts.tin_tip;
    require!(args.sequence == tip.sequence.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidTipSequence);
    require!(args.previous_commitment == tip.current_commitment, TcapError::TipCommitmentMismatch);
    require!(args.nullifier != tip.last_transition_nullifier, TcapError::NullifierAlreadyConsumed);

    let (expected_signer, _) = derive_tsn_authorization_signer(&ctx.accounts.config.approved_tsn_program, &args.authorization_digest);
    require_keys_eq!(expected_signer, ctx.accounts.tsn_authorization_signer.key(), TcapError::InvalidTsnAuthorizationSigner);
    let clock = Clock::get()?;
    require!(clock.slot >= args.valid_after_slot && clock.slot <= args.expires_at_slot, TcapError::AuthorizationExpired);

    let transition_digest = anchor_lang::solana_program::hash::hashv(&[
        b"TCAP_TIN_TIP_CREDIT_V2",
        tin_tip_key.as_ref(),
        &args.authorization_digest,
        args.previous_commitment.as_ref(),
        args.new_commitment.as_ref(),
        &args.sequence.to_le_bytes(),
        &args.token_id.to_le_bytes(),
        args.gpru_scope_commitment.as_ref(),
        args.nullifier.as_ref(),
        args.dna_key_commitment.as_ref(),
    ]).to_bytes();
    tip.current_commitment = args.new_commitment;
    tip.sequence = args.sequence;
    tip.last_transition_nullifier = args.nullifier;
    emit!(TcapTinTipCreditedV1 {
        tin_tip: ctx.accounts.tin_tip.key(),
        sequence: args.sequence,
        token_id: args.token_id,
        transition_digest,
    });
    Ok(())
}
