use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::authority::{derive_tsn_authorization_signer, TCAP_ASSET_ENTRY_SEED, TCAP_GLOBAL_CONFIG_SEED, TCAP_RESERVE_AUTHORITY_SEED};
use crate::error::TcapError;
use crate::state::{TcapAssetEntryV1, TcapAssetStatusV1, TcapGlobalConfigV1, TcapOneTimeTip, TcapReserveStateV1, TcapRiskStateV1, TcapTipLiabilityV2};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct ExitTcapTipV1Args {
    pub authorization_digest: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
    pub sequence: u64,
    pub token_id: u32,
    pub policy_commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub exit_amount: u64,
}

#[derive(Accounts)]
#[instruction(args: ExitTcapTipV1Args)]
pub struct ExitTcapTipV1<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(mut)]
    pub current_tip: Account<'info, TcapOneTimeTip>,
    #[account(seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()], bump = asset_entry.bump)]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)]
    pub reserve_state: Account<'info, TcapReserveStateV1>,
    #[account(mut, constraint = liability.tip == current_tip.key() @ TcapError::InvalidTipLiability, constraint = liability.asset_entry == asset_entry.key() @ TcapError::InvalidTipLiability)]
    pub liability: Account<'info, TcapTipLiabilityV2>,
    /// CHECK: canonical reserve authority PDA recorded by the asset entry.
    #[account(seeds = [TCAP_RESERVE_AUTHORITY_SEED, reserve_state.asset_state.as_ref()], bump = reserve_state.reserve_authority_bump)]
    pub reserve_authority: UncheckedAccount<'info>,
    #[account(mut, address = asset_entry.future_vault @ TcapError::ReserveVaultUnavailable, constraint = vault.mint == asset_entry.asset.mint @ TcapError::WrongAsset, constraint = vault.owner == reserve_authority.key() @ TcapError::InvalidReserve)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, constraint = destination.mint == asset_entry.asset.mint @ TcapError::WrongAsset)]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: destination token-account owner; no signature is required because this is a public exit.
    pub destination_owner: UncheckedAccount<'info>,
    #[account(address = asset_entry.asset.mint @ TcapError::WrongAsset)]
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    /// CHECK: PDA signer supplied by the TSN wrapper.
    pub tsn_authorization_signer: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ExitTcapTipV1>, args: ExitTcapTipV1Args) -> Result<()> {
    let slot = Clock::get()?.slot;
    require!(args.authorization_digest != [0; 32] && args.previous_commitment != [0; 32] && args.new_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.policy_commitment != [0; 32] && args.nullifier != [0; 32], TcapError::InvalidGpruScope);
    require!(args.exit_amount > 0 && args.expires_at_slot >= args.valid_after_slot && slot >= args.valid_after_slot && slot <= args.expires_at_slot, TcapError::AuthorizationExpired);
    require_keys_eq!(ctx.accounts.destination.owner, ctx.accounts.destination_owner.key(), TcapError::InvalidPda);
    require!(args.previous_commitment == ctx.accounts.current_tip.commitment, TcapError::TipCommitmentMismatch);
    require!(args.sequence == ctx.accounts.current_tip.sequence.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidTipSequence);
    require!(args.policy_commitment == ctx.accounts.current_tip.policy_commitment, TcapError::TipCommitmentMismatch);
    require!(!ctx.accounts.current_tip.consumed, TcapError::TipFrozen);
    require!(args.token_id == ctx.accounts.current_tip.token_id && args.token_id == ctx.accounts.asset_entry.token_id, TcapError::WrongAsset);
    require!(matches!(ctx.accounts.asset_entry.status, TcapAssetStatusV1::Active) && matches!(ctx.accounts.asset_entry.risk_state, TcapRiskStateV1::Approved) && !ctx.accounts.asset_entry.paused && !ctx.accounts.asset_entry.deprecated, TcapError::AssetUnavailable);
    require!(ctx.accounts.liability.version == 2 && ctx.accounts.liability.available >= args.exit_amount, TcapError::InsufficientConfidentialBalance);
    require!(ctx.accounts.reserve_state.settled_confidential_liabilities >= args.exit_amount, TcapError::InvalidReserveLiability);
    require!(ctx.accounts.vault.amount >= args.exit_amount, TcapError::InvalidReserveLiability);
    let expected = hashv(&[b"TSN_TCAP_EXIT_V1", ctx.accounts.current_tip.key().as_ref(), ctx.accounts.destination_owner.key().as_ref(), &args.valid_after_slot.to_le_bytes(), &args.expires_at_slot.to_le_bytes(), &args.previous_commitment, &args.new_commitment, &args.sequence.to_le_bytes(), &args.token_id.to_le_bytes(), &args.policy_commitment, &args.nullifier, &args.exit_amount.to_le_bytes()]).to_bytes();
    require!(args.authorization_digest == expected, TcapError::InvalidTipAuthorization);
    let (signer, _) = derive_tsn_authorization_signer(&ctx.accounts.config.approved_tsn_program, &args.authorization_digest);
    require_keys_eq!(signer, ctx.accounts.tsn_authorization_signer.key(), TcapError::InvalidTsnAuthorizationSigner);
    require!(ctx.accounts.tsn_authorization_signer.is_signer, TcapError::InvalidTsnAuthorizationSigner);
    let decimals = ctx.accounts.mint.decimals;
    token_interface::transfer_checked(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), TransferChecked { from: ctx.accounts.vault.to_account_info(), mint: ctx.accounts.mint.to_account_info(), to: ctx.accounts.destination.to_account_info(), authority: ctx.accounts.reserve_authority.to_account_info() }, &[&[TCAP_RESERVE_AUTHORITY_SEED, ctx.accounts.reserve_state.asset_state.as_ref(), &[ctx.accounts.reserve_state.reserve_authority_bump]]]), args.exit_amount, decimals)?;
    ctx.accounts.vault.reload()?;
    ctx.accounts.destination.reload()?;
    ctx.accounts.liability.available = ctx.accounts.liability.available.checked_sub(args.exit_amount).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.liability.spent = ctx.accounts.liability.spent.checked_add(args.exit_amount).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.reserve_state.settled_confidential_liabilities = ctx.accounts.reserve_state.settled_confidential_liabilities.checked_sub(args.exit_amount).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.reserve_state.actual_assets = ctx.accounts.vault.amount;
    ctx.accounts.current_tip.commitment = args.new_commitment;
    ctx.accounts.current_tip.sequence = args.sequence;
    ctx.accounts.current_tip.transition_nullifier = args.nullifier;
    Ok(())
}
