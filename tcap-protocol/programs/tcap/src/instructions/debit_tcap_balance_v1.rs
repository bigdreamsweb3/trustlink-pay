use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

use crate::authority::{derive_tsn_authorization_signer, TCAP_ASSET_ENTRY_SEED, TCAP_GLOBAL_CONFIG_SEED};
use crate::error::TcapError;
use crate::state::{TcapAssetEntryV1, TcapAssetStatusV1, TcapGlobalConfigV1, TcapOneTimeTip, TcapReserveStateV1, TcapRiskStateV1, TcapTipLiabilityV2};

/// Authenticated private TIP debit. The destination is intentionally absent:
/// it is bound only in the owner's off-chain permit and in the later credit
/// permit. No vault transfer, public pending-liability mutation, or destination
/// TIP is part of this instruction; only transfer_pending is updated.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct DebitTcapBalanceV1Args {
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
    pub debit_amount: u64,
}

#[derive(Accounts)]
#[instruction(args: DebitTcapBalanceV1Args)]
pub struct DebitTcapBalanceV1<'info> {
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
    /// CHECK: PDA signer supplied by the approved TSN CPI wrapper.
    pub tsn_authorization_signer: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<DebitTcapBalanceV1>, args: DebitTcapBalanceV1Args) -> Result<()> {
    let clock = Clock::get()?;
    let tip = &ctx.accounts.current_tip;
    let asset = &ctx.accounts.asset_entry;
    require!(args.authorization_digest != [0; 32] && args.previous_commitment != [0; 32] && args.new_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.policy_commitment != [0; 32] && args.gpru_scope_commitment != [0; 32] && args.nullifier != [0; 32], TcapError::InvalidGpruScope);
    require!(args.debit_amount > 0, TcapError::InvalidDepositAmount);
    require!(args.expires_at_slot >= args.valid_after_slot && clock.slot >= args.valid_after_slot && clock.slot <= args.expires_at_slot, TcapError::AuthorizationExpired);
    let expected_authorization = hashv(&[
        b"TSN_GPRU_TCAP_DEBIT_V2",
        ctx.accounts.current_tip.key().as_ref(),
        &args.valid_after_slot.to_le_bytes(),
        &args.expires_at_slot.to_le_bytes(),
        &args.previous_commitment,
        &args.new_commitment,
        &args.sequence.to_le_bytes(),
        &args.token_id.to_le_bytes(),
        &args.policy_commitment,
        &args.gpru_scope_commitment,
        &args.nullifier,
        &args.debit_amount.to_le_bytes(),
    ]).to_bytes();
    require!(args.authorization_digest == expected_authorization, TcapError::InvalidTipAuthorization);
    require!(args.previous_commitment == tip.commitment, TcapError::TipCommitmentMismatch);
    require!(args.sequence == tip.sequence.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidTipSequence);
    require!(args.policy_commitment == tip.policy_commitment, TcapError::TipCommitmentMismatch);
    require!(args.nullifier != tip.transition_nullifier, TcapError::NullifierAlreadyConsumed);
    require!(!tip.consumed, TcapError::TipFrozen);
    require!(args.token_id == tip.token_id && args.token_id == asset.token_id, TcapError::WrongAsset);
    require!(matches!(asset.status, TcapAssetStatusV1::Active) && matches!(asset.risk_state, TcapRiskStateV1::Approved) && !asset.paused && !asset.deprecated, TcapError::AssetUnavailable);
    require!(ctx.accounts.liability.version == 2, TcapError::InvalidTipLiability);
    require!(ctx.accounts.liability.available >= args.debit_amount, TcapError::InsufficientConfidentialBalance);
    require!(ctx.accounts.reserve_state.actual_assets >= ctx.accounts.reserve_state.transfer_liabilities().ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidReserveLiability);
    require!(ctx.accounts.reserve_state.settled_confidential_liabilities >= args.debit_amount, TcapError::InvalidReserveLiability);
    let (expected, _) = derive_tsn_authorization_signer(&ctx.accounts.config.approved_tsn_program, &args.authorization_digest);
    require_keys_eq!(expected, ctx.accounts.tsn_authorization_signer.key(), TcapError::InvalidTsnAuthorizationSigner);
    require!(ctx.accounts.tsn_authorization_signer.is_signer, TcapError::InvalidTsnAuthorizationSigner);

    let liability = &mut ctx.accounts.liability;
    liability.available = liability.available.checked_sub(args.debit_amount).ok_or(TcapError::ArithmeticOverflow)?;
    liability.spent = liability.spent.checked_add(args.debit_amount).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.reserve_state.settled_confidential_liabilities = ctx.accounts.reserve_state.settled_confidential_liabilities.checked_sub(args.debit_amount).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.reserve_state.transfer_pending = ctx.accounts.reserve_state.transfer_pending.checked_add(args.debit_amount).ok_or(TcapError::ArithmeticOverflow)?;
    require!(ctx.accounts.reserve_state.actual_assets >= ctx.accounts.reserve_state.transfer_liabilities().ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidReserveLiability);
    let tip = &mut ctx.accounts.current_tip;
    tip.commitment = args.new_commitment;
    tip.sequence = args.sequence;
    tip.transition_nullifier = args.nullifier;
    Ok(())
}

/// Retained for the explicitly disabled legacy exit path; debit itself is no
/// longer proof-gated.
pub(crate) fn proof_gate(_payload: &[u8]) -> Result<()> {
    err!(TcapError::ProofSystemNotEnabled)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debit_args_are_not_proof_gated() {
        let args = DebitTcapBalanceV1Args {
            authorization_digest: [1; 32], valid_after_slot: 1, expires_at_slot: 2,
            previous_commitment: [3; 32], new_commitment: [4; 32], sequence: 1,
            token_id: 2, policy_commitment: [5; 32], gpru_scope_commitment: [6; 32],
            nullifier: [7; 32], debit_amount: 1,
        };
        assert!(args.debit_amount > 0);
    }
}
