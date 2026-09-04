use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use crate::authority::derive_tsn_authorization_signer;
use crate::error::TcapError;
use crate::state::{TcapAssetEntryV1, TcapAssetStatusV1, TcapGlobalConfigV1, TcapOneTimeTip, TcapReserveStateV1, TcapRiskStateV1, TcapTipLiabilityV2};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct CreditOneTimeTipTransferArgs {
    pub authorization_digest: [u8; 32],
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
    pub policy_commitment: [u8; 32],
    pub nonce: [u8; 32],
    pub sequence: u64,
    pub token_id: u32,
    pub amount: u64,
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
}

#[derive(Accounts)]
#[instruction(args: CreditOneTimeTipTransferArgs)]
pub struct CreditOneTimeTipTransfer<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(seeds = [crate::authority::TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(mut)] pub current_tip: Account<'info, TcapOneTimeTip>,
    #[account(seeds = [crate::authority::TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()], bump = asset_entry.bump)]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)]
    pub reserve_state: Account<'info, TcapReserveStateV1>,
    #[account(mut, constraint = liability.tip == current_tip.key() @ TcapError::InvalidTipLiability, constraint = liability.asset_entry == asset_entry.key() @ TcapError::InvalidTipLiability)]
    pub liability: Account<'info, TcapTipLiabilityV2>,
    /// CHECK: authenticated against the governance-bound TSN program.
    #[account(executable, address = config.approved_tsn_program @ TcapError::InvalidTsnProgram)]
    pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: signer PDA supplied by approved TSN CPI.
    pub tsn_authorization_signer: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<CreditOneTimeTipTransfer>, args: CreditOneTimeTipTransferArgs) -> Result<()> {
    let clock = Clock::get()?;
    let tip = &ctx.accounts.current_tip;
    let asset = &ctx.accounts.asset_entry;
    require!(args.authorization_digest != [0; 32] && args.previous_commitment != [0; 32] && args.new_commitment != [0; 32] && args.nonce != [0; 32], TcapError::EmptyCommitment);
    require!(args.policy_commitment != [0; 32] && args.amount > 0, TcapError::InvalidDepositAmount);
    require!(args.expires_at_slot >= args.valid_after_slot && clock.slot >= args.valid_after_slot && clock.slot <= args.expires_at_slot, TcapError::AuthorizationExpired);
    let expected_permit = hashv(&[b"TCAP_ONE_TIME_TRANSFER_CREDIT_PERMIT_V1", ctx.accounts.current_tip.key().as_ref(), &args.amount.to_le_bytes(), &args.token_id.to_le_bytes(), asset.asset.mint.as_ref(), &args.nonce, &args.sequence.to_le_bytes(), &args.previous_commitment]).to_bytes();
    require!(args.authorization_digest == expected_permit, TcapError::InvalidTipAuthorization);
    let (expected, _) = derive_tsn_authorization_signer(&ctx.accounts.config.approved_tsn_program, &args.authorization_digest);
    require_keys_eq!(expected, ctx.accounts.tsn_authorization_signer.key(), TcapError::InvalidTsnAuthorizationSigner);
    require!(ctx.accounts.tsn_authorization_signer.is_signer, TcapError::InvalidTsnAuthorizationSigner);
    require!(args.previous_commitment == tip.commitment, TcapError::TipCommitmentMismatch);
    require!(args.sequence == tip.sequence.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidTipSequence);
    require!(args.policy_commitment == tip.policy_commitment, TcapError::TipCommitmentMismatch);
    require!(args.nonce != tip.transition_nullifier, TcapError::NullifierAlreadyConsumed);
    require!(!tip.consumed, TcapError::TipFrozen);
    require!(args.token_id == tip.token_id && args.token_id == asset.token_id, TcapError::WrongAsset);
    require!(matches!(asset.status, TcapAssetStatusV1::Active) && matches!(asset.risk_state, TcapRiskStateV1::Approved) && !asset.paused && !asset.deprecated, TcapError::AssetUnavailable);
    require!(ctx.accounts.reserve_state.transfer_pending >= args.amount, TcapError::InvalidTransferLiability);
    require!(ctx.accounts.liability.version == 2, TcapError::InvalidTipLiability);
    ctx.accounts.liability.available = ctx.accounts.liability.available.checked_add(args.amount).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.reserve_state.settled_confidential_liabilities = ctx.accounts.reserve_state.settled_confidential_liabilities.checked_add(args.amount).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.reserve_state.transfer_pending = ctx.accounts.reserve_state.transfer_pending.checked_sub(args.amount).ok_or(TcapError::ArithmeticOverflow)?;
    require!(ctx.accounts.reserve_state.actual_assets >= ctx.accounts.reserve_state.transfer_liabilities().ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidReserveLiability);
    let tip = &mut ctx.accounts.current_tip;
    tip.commitment = args.new_commitment;
    tip.sequence = args.sequence;
    tip.transition_nullifier = args.nonce;
    Ok(())
}
