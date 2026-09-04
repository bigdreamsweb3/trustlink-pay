use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use crate::authority::derive_tsn_authorization_signer;
use crate::error::TcapError;
use crate::state::{TcapAssetEntryV1, TcapAssetStatusV1, TcapGlobalConfigV1, TcapOneTimeTip, TcapReserveStateV1, TcapRiskStateV1, TcapTipLiabilityV2};

#[derive(Accounts)]
#[instruction(
    authorization_digest: [u8; 32],
    previous_commitment: [u8; 32],
    new_commitment: [u8; 32],
    policy_commitment: [u8; 32],
    nonce: [u8; 32],
    sequence: u64,
    token_id: u32,
    amount: u64,
    valid_after_slot: u64,
    expires_at_slot: u64,
)]
pub struct CreditOneTimeTip<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(seeds = [crate::authority::TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(mut)] pub current_tip: Account<'info, TcapOneTimeTip>,
    #[account(
        seeds = [crate::authority::TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump,
        constraint = matches!(asset_entry.status, TcapAssetStatusV1::Active) && matches!(asset_entry.risk_state, TcapRiskStateV1::Approved) @ TcapError::AssetUnavailable,
        constraint = !asset_entry.paused && !asset_entry.deprecated @ TcapError::AssetUnavailable,
    )]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)]
    pub reserve_state: Account<'info, TcapReserveStateV1>,
    #[account(mut, constraint = liability.tip == current_tip.key() @ TcapError::InvalidTipLiability, constraint = liability.asset_entry == asset_entry.key() @ TcapError::InvalidTipLiability)]
    pub liability: Account<'info, TcapTipLiabilityV2>,
    /// CHECK: approved TSN executable.
    #[account(executable, address = config.approved_tsn_program @ TcapError::InvalidTsnProgram)]
    pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: signer PDA supplied by approved TSN CPI.
    pub tsn_authorization_signer: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<CreditOneTimeTip>,
    authorization_digest: [u8; 32],
    previous_commitment: [u8; 32],
    new_commitment: [u8; 32],
    policy_commitment: [u8; 32],
    nonce: [u8; 32],
    sequence: u64,
    token_id: u32,
    amount: u64,
    valid_after_slot: u64,
    expires_at_slot: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    require!(authorization_digest != [0; 32] && new_commitment != [0; 32] && nonce != [0; 32], TcapError::EmptyCommitment);
    require!(policy_commitment != [0; 32] && amount > 0, TcapError::InvalidDepositAmount);
    require!(expires_at_slot >= valid_after_slot, TcapError::AuthorizationExpired);
    let (expected, _) = derive_tsn_authorization_signer(&ctx.accounts.config.approved_tsn_program, &authorization_digest);
    require_keys_eq!(expected, ctx.accounts.tsn_authorization_signer.key(), TcapError::InvalidTsnAuthorizationSigner);
    require!(ctx.accounts.tsn_authorization_signer.is_signer, TcapError::InvalidTsnAuthorizationSigner);
    require!(clock.slot >= valid_after_slot && clock.slot <= expires_at_slot, TcapError::AuthorizationExpired);

    let expected_permit = hashv(&[
        b"TCAP_ONE_TIME_CREDIT_PERMIT_V1",
        ctx.accounts.current_tip.key().as_ref(),
        &amount.to_le_bytes(),
        &token_id.to_le_bytes(),
        ctx.accounts.asset_entry.asset.mint.as_ref(),
        &nonce,
        &sequence.to_le_bytes(),
        &previous_commitment,
    ]).to_bytes();
    require!(authorization_digest == expected_permit, TcapError::InvalidTipAuthorization);

    let current = &mut ctx.accounts.current_tip;
    require!(previous_commitment == current.commitment, TcapError::TipCommitmentMismatch);
    require!(sequence == current.sequence.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidTipSequence);
    require!(token_id == current.token_id, TcapError::AssetUnavailable);
    require!(token_id == ctx.accounts.asset_entry.token_id, TcapError::AssetUnavailable);
    require!(policy_commitment == current.policy_commitment, TcapError::TipCommitmentMismatch);
    require!(nonce != current.transition_nullifier, TcapError::NullifierAlreadyConsumed);
    require!(ctx.accounts.reserve_state.pending_liabilities >= amount, TcapError::InvalidReserveLiability);
    require!(ctx.accounts.reserve_state.actual_assets >= ctx.accounts.reserve_state.settled_confidential_liabilities.checked_add(amount).ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidReserveLiability);
    require!(ctx.accounts.liability.version == 2, TcapError::InvalidTipLiability);

    current.commitment = new_commitment;
    current.sequence = sequence;
    current.transition_nullifier = nonce;
    // The blinded-root TIP is a stable custody index. Rotate only its
    // commitment/nullifier in place; no successor TIP or per-credit liability
    // account is created.
    current.consumed = false;
    ctx.accounts.reserve_state.pending_liabilities = ctx.accounts.reserve_state.pending_liabilities.checked_sub(amount).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.reserve_state.settled_confidential_liabilities = ctx.accounts.reserve_state.settled_confidential_liabilities.checked_add(amount).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.liability.available = ctx.accounts.liability.available.checked_add(amount).ok_or(TcapError::ArithmeticOverflow)?;
    Ok(())
}
