use anchor_lang::prelude::*;

use crate::authority::{derive_tsn_authorization_signer, TCAP_COMMITMENT_ROOT_SEED};
use crate::error::TcapError;
use crate::events::TcapGpruMemoCreditedV1;
use crate::state::{TcapAssetEntryV1, TcapAssetStatusV1, TcapCommitmentRootStateV1, TcapGlobalConfigV1, TcapRiskStateV1};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct CreditGpruMemoV1Args {
    pub authorization_digest: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
    pub sequence: u64,
    pub previous_tcap_root: [u8; 32],
    pub tcap_root_sequence: u64,
    pub token_id: u32,
    pub policy_commitment: [u8; 32],
    pub gpru_scope_commitment: [u8; 32],
    pub memo_commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub dna_key_commitment: [u8; 32],
}

#[derive(Accounts)]
#[instruction(args: CreditGpruMemoV1Args)]
pub struct CreditGpruMemoV1<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [crate::authority::TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(
        mut,
        seeds = [TCAP_COMMITMENT_ROOT_SEED],
        bump = commitment_root.bump,
        constraint = config.commitment_root_state == commitment_root.key() @ TcapError::InvalidPda,
        constraint = !commitment_root.paused @ TcapError::ProtocolPaused
    )]
    pub commitment_root: Account<'info, TcapCommitmentRootStateV1>,
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

pub fn handler(ctx: Context<CreditGpruMemoV1>, args: CreditGpruMemoV1Args) -> Result<()> {
    require!(args.authorization_digest != [0; 32], TcapError::EmptyCommitment);
    require!(args.previous_commitment != [0; 32] && args.new_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.policy_commitment != [0; 32] && args.gpru_scope_commitment != [0; 32], TcapError::InvalidGpruScope);
    require!(args.memo_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.nullifier != [0; 32] && args.dna_key_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.previous_tcap_root != [0; 32], TcapError::WrongTcapRoot);

    let asset = &ctx.accounts.asset_entry;
    require!(asset.token_id == args.token_id, TcapError::WrongAsset);
    require!(matches!(asset.status, TcapAssetStatusV1::Active) && matches!(asset.risk_state, TcapRiskStateV1::Approved), TcapError::AssetUnavailable);
    require!(!asset.paused && !asset.deprecated, TcapError::AssetUnavailable);

    let root = &mut ctx.accounts.commitment_root;
    require!(root.version == crate::TCAP_STATE_VERSION_V1, TcapError::InvalidPda);
    require!(args.previous_tcap_root == root.current_root, TcapError::WrongTcapRoot);
    require!(
        args.tcap_root_sequence == root.sequence.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?,
        TcapError::WrongTcapRoot
    );

    let (expected_signer, _) = derive_tsn_authorization_signer(&ctx.accounts.config.approved_tsn_program, &args.authorization_digest);
    require_keys_eq!(expected_signer, ctx.accounts.tsn_authorization_signer.key(), TcapError::InvalidTsnAuthorizationSigner);
    let clock = Clock::get()?;
    require!(clock.slot >= args.valid_after_slot && clock.slot <= args.expires_at_slot, TcapError::AuthorizationExpired);

    let transition_digest = anchor_lang::solana_program::hash::hashv(&[
        b"TCAP_GPRU_MEMO_CREDIT_V1",
        &args.previous_tcap_root,
        &args.tcap_root_sequence.to_le_bytes(),
        &args.authorization_digest,
        args.previous_commitment.as_ref(),
        args.new_commitment.as_ref(),
        &args.sequence.to_le_bytes(),
        &args.token_id.to_le_bytes(),
        args.gpru_scope_commitment.as_ref(),
        args.memo_commitment.as_ref(),
        args.nullifier.as_ref(),
        args.dna_key_commitment.as_ref(),
    ]).to_bytes();
    let next_root = anchor_lang::solana_program::hash::hashv(&[
        b"TCAP_GPRU_MEMO_SETTLEMENT_ROOT_V1\0",
        &root.current_root,
        &args.authorization_digest,
        &args.nullifier,
        &args.previous_commitment,
        &args.new_commitment,
        &args.sequence.to_le_bytes(),
        &args.token_id.to_le_bytes(),
        &args.gpru_scope_commitment,
        &args.memo_commitment,
        &args.dna_key_commitment,
        &args.tcap_root_sequence.to_le_bytes(),
    ]).to_bytes();
    let previous_root = root.current_root;
    root.previous_root = previous_root;
    root.current_root = next_root;
    root.sequence = args.tcap_root_sequence;
    root.root_version = root.root_version.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?;
    emit!(TcapGpruMemoCreditedV1 {
        previous_root,
        current_root: next_root,
        settlement_sequence: args.tcap_root_sequence,
        balance_sequence: args.sequence,
        token_id: args.token_id,
        transition_digest,
    });
    Ok(())
}
