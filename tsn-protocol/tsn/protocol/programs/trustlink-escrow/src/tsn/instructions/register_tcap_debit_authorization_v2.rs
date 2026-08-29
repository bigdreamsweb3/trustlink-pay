use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};
use crate::tsn::{constants::{TSN_MOTHER_ESCROW_SEED, TSN_TCAP_AUTHORITY_SEED}, errors::TsnError, state::MotherEscrow};

const TCAP_DEBIT_PROGRAM_ID: Pubkey = pubkey!("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");
const AUTHORIZATION_DOMAIN: &[u8] = b"TSN_GPRU_TCAP_DEBIT_V2";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct RegisterTcapDebitAuthorizationV2Args {
    pub authorization_digest: [u8; 32], pub valid_after_slot: u64, pub expires_at_slot: u64,
    pub previous_commitment: [u8; 32], pub new_commitment: [u8; 32], pub sequence: u64,
    pub token_id: u32, pub policy_commitment: [u8; 32], pub gpru_scope_commitment: [u8; 32],
    pub nullifier: [u8; 32], pub debit_amount: u64,
}

#[derive(Accounts)]
#[instruction(args: RegisterTcapDebitAuthorizationV2Args)]
pub struct RegisterTcapDebitAuthorizationV2<'info> {
    #[account(mut)] pub authority: Signer<'info>,
    #[account(seeds = [TSN_MOTHER_ESCROW_SEED], bump = mother_escrow.bump, constraint = mother_escrow.authority == authority.key() @ TsnError::Unauthorized)]
    pub mother_escrow: Account<'info, MotherEscrow>,
    /// CHECK: constrained to the governed TCAP deployment.
    #[account(executable, address = TCAP_DEBIT_PROGRAM_ID)] pub tcap_program: UncheckedAccount<'info>,
    /// CHECK: TCAP validates this exact approved TSN executable.
    #[account(executable, address = crate::ID)] pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: validated by TCAP against its global config.
    pub tcap_config: UncheckedAccount<'info>,
    /// CHECK: validated by TCAP.
    pub tcap_asset_entry: UncheckedAccount<'info>,
    /// CHECK: blinded tip root.
    pub tip_root: UncheckedAccount<'info>,
    /// CHECK: canonical TCAP tip.
    pub tin_tip: UncheckedAccount<'info>,
    /// CHECK: canonical reserve state.
    pub reserve_state: UncheckedAccount<'info>,
    /// CHECK: canonical opaque liability state.
    pub liability: UncheckedAccount<'info>,
    /// CHECK: TSN-owned signer PDA.
    pub tcap_authorization_signer: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterTcapDebitAuthorizationV2>, args: RegisterTcapDebitAuthorizationV2Args) -> Result<()> {
    require!(args.authorization_digest != [0; 32] && args.previous_commitment != [0; 32] && args.new_commitment != [0; 32], TsnError::Unauthorized);
    require!(args.policy_commitment != [0; 32] && args.gpru_scope_commitment != [0; 32] && args.nullifier != [0; 32], TsnError::Unauthorized);
    require!(args.sequence > 0 && args.token_id > 0 && args.debit_amount > 0 && args.expires_at_slot >= args.valid_after_slot, TsnError::Unauthorized);
    require!(args.authorization_digest == derive_debit_authorization_digest_v2(&args, &ctx.accounts.tin_tip.key()), TsnError::Unauthorized);
    let (expected_signer, bump) = Pubkey::find_program_address(&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest], &crate::ID);
    require_keys_eq!(expected_signer, ctx.accounts.tcap_authorization_signer.key(), TsnError::Unauthorized);
    let mut data = anchor_lang::solana_program::hash::hash(b"global:debit_tcap_gpru_tip_v2").to_bytes()[..8].to_vec();
    data.extend_from_slice(&args.try_to_vec()?);
    let ix = Instruction { program_id: TCAP_DEBIT_PROGRAM_ID, accounts: vec![
        AccountMeta::new(ctx.accounts.authority.key(), true), AccountMeta::new_readonly(ctx.accounts.tcap_config.key(), false),
        AccountMeta::new(ctx.accounts.tin_tip.key(), false), AccountMeta::new_readonly(ctx.accounts.tip_root.key(), false),
        AccountMeta::new_readonly(ctx.accounts.tcap_asset_entry.key(), false), AccountMeta::new(ctx.accounts.reserve_state.key(), false),
        AccountMeta::new(ctx.accounts.liability.key(), false), AccountMeta::new_readonly(ctx.accounts.tcap_authorization_signer.key(), true),
    ], data };
    invoke_signed(&ix, &[
        ctx.accounts.authority.to_account_info(), ctx.accounts.tcap_config.to_account_info(), ctx.accounts.tin_tip.to_account_info(),
        ctx.accounts.tip_root.to_account_info(), ctx.accounts.tcap_asset_entry.to_account_info(), ctx.accounts.reserve_state.to_account_info(),
        ctx.accounts.liability.to_account_info(), ctx.accounts.tcap_authorization_signer.to_account_info(), ctx.accounts.tcap_program.to_account_info(),
    ], &[&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest, &[bump]]])?;
    Ok(())
}

pub fn derive_debit_authorization_digest_v2(args: &RegisterTcapDebitAuthorizationV2Args, tin_tip: &Pubkey) -> [u8; 32] {
    anchor_lang::solana_program::hash::hashv(&[AUTHORIZATION_DOMAIN, tin_tip.as_ref(), &args.valid_after_slot.to_le_bytes(), &args.expires_at_slot.to_le_bytes(), &args.previous_commitment, &args.new_commitment, &args.sequence.to_le_bytes(), &args.token_id.to_le_bytes(), &args.policy_commitment, &args.gpru_scope_commitment, &args.nullifier, &args.debit_amount.to_le_bytes()]).to_bytes()
}
