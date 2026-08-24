use anchor_lang::prelude::*;

use crate::authority::{
    TCAP_ASSET_ENTRY_SEED, TCAP_EXIT_RECEIPT_SEED, TCAP_GLOBAL_CONFIG_SEED,
    TCAP_LIQUIDITY_POOL_SEED, TCAP_NULLIFIER_SEED, TCAP_TIN_TIP_V1_SEED,
};
use crate::error::TcapError;
use crate::state::{
    NullifierRecordV1, TCapTinTipV1, TcapAssetEntryV1, TcapExitReceiptV1, TcapGlobalConfigV1,
    TcapLiquidityPoolV1,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ExitTcapLiquidityV1Args {
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
    pub sequence: u64,
    pub token_id: u32,
    pub policy_commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub exit_amount: u64,
    pub rate_version: u32,
    pub destination: Pubkey,
    pub destination_binding: [u8; 32],
    pub exit_receipt_digest: [u8; 32],
    pub proof_payload: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: ExitTcapLiquidityV1Args)]
pub struct ExitTcapLiquidityV1<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(mut, seeds = [TCAP_TIN_TIP_V1_SEED, tip_root.key().as_ref()], bump = tin_tip.bump)]
    pub tin_tip: Box<Account<'info, TCapTinTipV1>>,
    /// CHECK: blinded root used only to derive the tip PDA.
    pub tip_root: UncheckedAccount<'info>,
    #[account(seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()], bump = asset_entry.bump)]
    pub asset_entry: Box<Account<'info, TcapAssetEntryV1>>,
    #[account(mut, seeds = [TCAP_LIQUIDITY_POOL_SEED, config.key().as_ref(), &args.token_id.to_le_bytes()], bump = liquidity_pool.bump)]
    pub liquidity_pool: Box<Account<'info, TcapLiquidityPoolV1>>,
    #[account(init_if_needed, payer = payer, space = TcapExitReceiptV1::SPACE, seeds = [TCAP_EXIT_RECEIPT_SEED, args.exit_receipt_digest.as_ref()], bump)]
    pub exit_receipt: Box<Account<'info, TcapExitReceiptV1>>,
    /// CHECK: reserved proof-verifier account; no proof is trusted yet.
    pub proof_account: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, space = NullifierRecordV1::SPACE, seeds = [TCAP_NULLIFIER_SEED, args.nullifier.as_ref()], bump)]
    pub nullifier_record: Box<Account<'info, NullifierRecordV1>>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ExitTcapLiquidityV1>, args: ExitTcapLiquidityV1Args) -> Result<()> {
    validate_structure(
        &ctx.accounts.tin_tip,
        &ctx.accounts.asset_entry,
        &ctx.accounts.liquidity_pool,
        &args,
    )?;
    crate::instructions::debit_tcap_balance_v1::proof_gate(&args.proof_payload)?;
    let _ = (
        ctx.accounts.proof_account.key(),
        ctx.accounts.exit_receipt.key(),
    );
    err!(TcapError::ProofSystemNotEnabled)
}

fn validate_structure(
    tip: &TCapTinTipV1,
    asset: &TcapAssetEntryV1,
    pool: &TcapLiquidityPoolV1,
    args: &ExitTcapLiquidityV1Args,
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
        args.destination != Pubkey::default() && args.destination_binding != [0; 32],
        TcapError::InvalidPda
    );
    require!(
        args.exit_receipt_digest != [0; 32],
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
    require!(
        args.token_id == asset.token_id && args.token_id == pool.token_id,
        TcapError::WrongAsset
    );
    require!(args.exit_amount > 0, TcapError::InvalidDepositAmount);
    require!(
        args.expires_at_slot >= args.valid_after_slot,
        TcapError::AuthorizationExpired
    );
    require!(
        pool.actual_assets >= pool.reserved_liabilities,
        TcapError::InsolventPendingFunding
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exit_proof_gate_is_fail_closed() {
        assert!(crate::instructions::debit_tcap_balance_v1::proof_gate(&[]).is_err());
        assert!(crate::instructions::debit_tcap_balance_v1::proof_gate(&[1]).is_err());
    }
}
