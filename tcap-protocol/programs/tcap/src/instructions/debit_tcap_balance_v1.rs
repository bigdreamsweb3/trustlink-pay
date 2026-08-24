use anchor_lang::prelude::*;

use crate::authority::{
    TCAP_ASSET_ENTRY_SEED, TCAP_GLOBAL_CONFIG_SEED, TCAP_NULLIFIER_SEED, TCAP_TIN_TIP_V1_SEED,
};
use crate::error::TcapError;
use crate::state::{NullifierRecordV1, TCapTinTipV1, TcapAssetEntryV1, TcapGlobalConfigV1};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct DebitTcapBalanceV1Args {
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
    pub sequence: u64,
    pub token_id: u32,
    pub policy_commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub debit_amount: u64,
    pub rate_version: u32,
    pub proof_payload: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: DebitTcapBalanceV1Args)]
pub struct DebitTcapBalanceV1<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(mut, seeds = [TCAP_TIN_TIP_V1_SEED, tip_root.key().as_ref()], bump = tin_tip.bump)]
    pub tin_tip: Account<'info, TCapTinTipV1>,
    /// CHECK: blinded root used only to derive the tip PDA.
    pub tip_root: UncheckedAccount<'info>,
    #[account(seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()], bump = asset_entry.bump)]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    /// CHECK: reserved proof-verifier account; no proof is trusted yet.
    pub proof_account: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, space = NullifierRecordV1::SPACE, seeds = [TCAP_NULLIFIER_SEED, args.nullifier.as_ref()], bump)]
    pub nullifier_record: Account<'info, NullifierRecordV1>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DebitTcapBalanceV1>, args: DebitTcapBalanceV1Args) -> Result<()> {
    validate_structure(&ctx.accounts.tin_tip, &ctx.accounts.asset_entry, &args)?;
    proof_gate(&args.proof_payload)?;
    let _ = ctx.accounts.proof_account.key();
    err!(TcapError::ProofSystemNotEnabled)
}

pub(crate) fn proof_gate(payload: &[u8]) -> Result<()> {
    require!(
        !payload.is_empty() && payload.len() <= 4096,
        TcapError::ProofPayloadRequired
    );
    err!(TcapError::ProofSystemNotEnabled)
}

/// Pure witness equations for the future verifier. This function is not
/// reachable from an enabled instruction and never writes on-chain state.
pub(crate) fn validate_conservation_witness(
    old_balance: u64,
    debit_amount: u64,
    new_balance: u64,
    native_units: u64,
    stable_units: u64,
    rate_numerator: u64,
    rate_denominator: u64,
) -> Result<()> {
    require!(old_balance >= debit_amount, TcapError::InvalidDepositAmount);
    require!(
        new_balance == old_balance - debit_amount,
        TcapError::TipCommitmentMismatch
    );
    require!(rate_denominator != 0, TcapError::InvalidRateVersion);
    let converted = native_units
        .checked_mul(rate_numerator)
        .ok_or(TcapError::ArithmeticOverflow)?;
    require!(converted % rate_denominator == 0, TcapError::InvalidRateVersion);
    require!(converted / rate_denominator == stable_units, TcapError::InvalidRateVersion);
    Ok(())
}

fn validate_structure(
    tip: &TCapTinTipV1,
    asset: &TcapAssetEntryV1,
    args: &DebitTcapBalanceV1Args,
) -> Result<()> {
    require!(
        args.previous_commitment != [0; 32] && args.new_commitment != [0; 32],
        TcapError::EmptyCommitment
    );
    require!(
        args.policy_commitment != [0; 32] && args.nullifier != [0; 32],
        TcapError::EmptyCommitment
    );
    require!(
        args.previous_commitment == tip.current_commitment,
        TcapError::TipCommitmentMismatch
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
        args.policy_commitment == tip.policy_commitment,
        TcapError::TipCommitmentMismatch
    );
    require!(args.token_id == asset.token_id, TcapError::WrongAsset);
    require!(args.debit_amount > 0, TcapError::InvalidDepositAmount);
    require!(
        args.expires_at_slot >= args.valid_after_slot,
        TcapError::AuthorizationExpired
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proof_gate_is_fail_closed() {
        assert!(proof_gate(&[]).is_err());
        assert!(proof_gate(&[1]).is_err());
    }

    #[test]
    fn conservation_equations_are_explicit_but_not_enabled() {
        assert!(validate_conservation_witness(10, 3, 7, 3, 6, 2, 1).is_ok());
        assert!(validate_conservation_witness(2, 3, 0, 3, 6, 2, 1).is_err());
        assert!(validate_conservation_witness(10, 3, 8, 3, 6, 2, 1).is_err());
    }
}
