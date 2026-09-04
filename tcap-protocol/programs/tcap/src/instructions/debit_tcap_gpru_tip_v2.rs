use anchor_lang::prelude::*;

use crate::authority::{derive_tsn_authorization_signer, TCAP_ASSET_ENTRY_SEED, TCAP_GLOBAL_CONFIG_SEED, TCAP_TIP_LIABILITY_V2_SEED, TCAP_TIN_TIP_V1_SEED};
use crate::error::TcapError;
use crate::state::{TCapTinTipV1, TcapAssetEntryV1, TcapGlobalConfigV1, TcapReserveStateV1, TcapRiskStateV1, TcapAssetStatusV1, TcapTipLiabilityV2};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct DebitTcapGpruTipV2Args {
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
#[instruction(args: DebitTcapGpruTipV2Args)]
pub struct DebitTcapGpruTipV2<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(mut, seeds = [TCAP_TIN_TIP_V1_SEED, tip_root.key().as_ref()], bump = tin_tip.bump)]
    pub tin_tip: Account<'info, TCapTinTipV1>,
    /// CHECK: blinded root used only to derive the opaque tip PDA.
    pub tip_root: UncheckedAccount<'info>,
    #[account(seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()], bump = asset_entry.bump)]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)]
    pub reserve_state: Account<'info, TcapReserveStateV1>,
    #[account(mut, seeds = [TCAP_TIP_LIABILITY_V2_SEED, tin_tip.key().as_ref(), asset_entry.key().as_ref()], bump = liability.bump)]
    pub liability: Account<'info, TcapTipLiabilityV2>,
    /// CHECK: PDA signer derived from the opaque authorization digest.
    pub tsn_authorization_signer: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<DebitTcapGpruTipV2>, args: DebitTcapGpruTipV2Args) -> Result<()> {
    validate_debit(&ctx.accounts.tin_tip, &ctx.accounts.asset_entry, &ctx.accounts.liability, &ctx.accounts.reserve_state, &args, Clock::get()?.slot)?;
    let (expected, _) = derive_tsn_authorization_signer(&ctx.accounts.config.approved_tsn_program, &args.authorization_digest);
    require_keys_eq!(expected, ctx.accounts.tsn_authorization_signer.key(), TcapError::InvalidTsnAuthorizationSigner);
    ctx.accounts.liability.available -= args.debit_amount;
    ctx.accounts.liability.spent = ctx.accounts.liability.spent.checked_add(args.debit_amount).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.reserve_state.settled_confidential_liabilities -= args.debit_amount;
    ctx.accounts.tin_tip.current_commitment = args.new_commitment;
    ctx.accounts.tin_tip.sequence = args.sequence;
    ctx.accounts.tin_tip.last_transition_nullifier = args.nullifier;
    Ok(())
}

fn validate_debit(tip: &TCapTinTipV1, asset: &TcapAssetEntryV1, liability: &TcapTipLiabilityV2, reserve: &TcapReserveStateV1, args: &DebitTcapGpruTipV2Args, current_slot: u64) -> Result<()> {
    require!(args.authorization_digest != [0; 32] && args.previous_commitment != [0; 32] && args.new_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.policy_commitment != [0; 32] && args.gpru_scope_commitment != [0; 32] && args.nullifier != [0; 32], TcapError::InvalidGpruScope);
    require!(args.debit_amount > 0, TcapError::InvalidDepositAmount);
    require!(args.expires_at_slot >= args.valid_after_slot, TcapError::AuthorizationExpired);
    require!(args.previous_commitment == tip.current_commitment, TcapError::TipCommitmentMismatch);
    require!(args.sequence == tip.sequence.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidTipSequence);
    require!(args.policy_commitment == tip.policy_commitment, TcapError::TipCommitmentMismatch);
    require!(args.nullifier != tip.last_transition_nullifier, TcapError::NullifierAlreadyConsumed);
    require!(!tip.frozen, TcapError::TipFrozen);
    require!(args.token_id == asset.token_id, TcapError::WrongAsset);
    require!(matches!(asset.status, TcapAssetStatusV1::Active) && matches!(asset.risk_state, TcapRiskStateV1::Approved) && !asset.paused && !asset.deprecated, TcapError::AssetUnavailable);
    require!(liability.tip != Pubkey::default() && liability.asset_entry != Pubkey::default() && liability.version == 2, TcapError::InvalidTipLiability);
    require!(liability.available >= args.debit_amount, TcapError::InsufficientConfidentialBalance);
    require!(reserve.settled_confidential_liabilities >= args.debit_amount, TcapError::InvalidReserveLiability);
    require!(reserve.actual_assets >= reserve.settled_confidential_liabilities, TcapError::InvalidReserveLiability);
    require!(current_slot >= args.valid_after_slot && current_slot <= args.expires_at_slot, TcapError::AuthorizationExpired);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{TCapTinTipV1, TcapAssetEntryV1, TcapAssetIdV1, TcapReserveStateV1, TcapTipLiabilityV2};
    use anchor_lang::prelude::Pubkey;
    fn fixture() -> (TCapTinTipV1, TcapAssetEntryV1, TcapTipLiabilityV2, TcapReserveStateV1, DebitTcapGpruTipV2Args) {
        let tip = TCapTinTipV1 { version: 1, current_commitment: [1; 32], sequence: 4, policy_commitment: [2; 32], last_transition_nullifier: [3; 32], frozen: false, bump: 1 };
        let asset = TcapAssetEntryV1 { version: 1, protocol_version: 1, registry: Pubkey::new_unique(), token_id: 7, asset: crate::state::TcapAssetIdV1 { token_program: Pubkey::new_unique(), mint: Pubkey::new_unique(), registry_version: 1, asset_commitment: [4; 32] }, reserve_state: Pubkey::new_unique(), future_vault: Pubkey::new_unique(), reserve_authority: Pubkey::new_unique(), decimals: 6, deposits_enabled: true, withdrawals_enabled: true, paused: false, transfer_fee_policy: 0, freeze_authority_policy: 0, issuer_control_policy: 0, governance_approval: [5; 32], status: TcapAssetStatusV1::Active, risk_state: TcapRiskStateV1::Approved, deprecated: false, bump: 1 };
        let liability = TcapTipLiabilityV2 { version: 2, tip: Pubkey::new_unique(), asset_entry: Pubkey::new_unique(), available: 10, spent: 0, bump: 1 };
        let reserve = TcapReserveStateV1 { version: 1, protocol_version: 1, asset_state: Pubkey::new_unique(), asset_entry: Pubkey::new_unique(), future_vault: Pubkey::new_unique(), reserve_authority: Pubkey::new_unique(), actual_assets: 100, pending_liabilities: 0, settled_confidential_liabilities: 10, authorized_withdrawal_liabilities: 0, reserved_refund_liabilities: 0, accounting_epoch: 0, funding_enabled: true, paused: false, bump: 1, reserve_authority_bump: 1, future_vault_bump: 1, transfer_pending: 0 };
        let args = DebitTcapGpruTipV2Args { authorization_digest: [6; 32], valid_after_slot: 10, expires_at_slot: 20, previous_commitment: [1; 32], new_commitment: [7; 32], sequence: 5, token_id: 7, policy_commitment: [2; 32], gpru_scope_commitment: [8; 32], nullifier: [9; 32], debit_amount: 3 };
        (tip, asset, liability, reserve, args)
    }

    #[test] fn amount_must_be_positive() { let (t,a,l,r,mut x)=fixture(); x.debit_amount=0; assert!(validate_debit(&t,&a,&l,&r,&x,15).is_err()); }
    #[test] fn sequence_and_nullifier_are_checked() { let (t,a,l,r,mut x)=fixture(); x.sequence=6; assert!(validate_debit(&t,&a,&l,&r,&x,15).is_err()); x.sequence=5; x.nullifier=[3;32]; assert!(validate_debit(&t,&a,&l,&r,&x,15).is_err()); }
    #[test] fn asset_and_expiry_are_checked() { let (t,a,l,r,mut x)=fixture(); x.token_id=8; assert!(validate_debit(&t,&a,&l,&r,&x,15).is_err()); x.token_id=7; assert!(validate_debit(&t,&a,&l,&r,&x,21).is_err()); }
    #[test] fn liability_bounds_are_checked() { let (t,a,mut l,r,mut x)=fixture(); x.debit_amount=11; assert!(validate_debit(&t,&a,&l,&r,&x,15).is_err()); l.available=20; x.debit_amount=11; assert!(validate_debit(&t,&a,&l,&r,&x,15).is_err()); }
}
