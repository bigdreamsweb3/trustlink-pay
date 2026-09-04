use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};
use anchor_lang::InstructionData;
use tcap::instruction::ExitTcapTipV1;
use crate::tsn::{constants::{TSN_MOTHER_ESCROW_SEED, TSN_TCAP_AUTHORITY_SEED}, errors::TsnError, state::MotherEscrow};

const TCAP_PROGRAM_ID: Pubkey = pubkey!("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct RegisterTcapExitAuthorizationV1Args {
    pub authorization_digest: [u8; 32], pub valid_after_slot: u64, pub expires_at_slot: u64,
    pub previous_commitment: [u8; 32], pub new_commitment: [u8; 32], pub sequence: u64,
    pub token_id: u32, pub policy_commitment: [u8; 32], pub nullifier: [u8; 32], pub exit_amount: u64,
}

#[derive(Accounts)]
pub struct RegisterTcapExitAuthorizationV1<'info> {
    #[account(mut)] pub authority: Signer<'info>,
    #[account(seeds = [TSN_MOTHER_ESCROW_SEED], bump = mother_escrow.bump, constraint = mother_escrow.authority == authority.key() @ TsnError::Unauthorized)]
    pub mother_escrow: Account<'info, MotherEscrow>,
    /// CHECK: governed TCAP executable.
    #[account(executable, address = TCAP_PROGRAM_ID)] pub tcap_program: UncheckedAccount<'info>,
    /// CHECK: this program executable.
    #[account(executable, address = crate::ID)] pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: validated by TCAP.
    pub tcap_config: UncheckedAccount<'info>,
    /// CHECK: validated by TCAP.
    pub current_tip: UncheckedAccount<'info>,
    /// CHECK: validated by TCAP.
    pub asset_entry: UncheckedAccount<'info>,
    /// CHECK: validated by TCAP.
    pub reserve_state: UncheckedAccount<'info>,
    /// CHECK: validated by TCAP.
    pub liability: UncheckedAccount<'info>,
    /// CHECK: canonical reserve authority PDA.
    pub reserve_authority: UncheckedAccount<'info>,
    /// CHECK: governed vault token account.
    pub vault: UncheckedAccount<'info>,
    /// CHECK: public destination token account.
    pub destination: UncheckedAccount<'info>,
    /// CHECK: destination owner.
    pub destination_owner: UncheckedAccount<'info>,
    /// CHECK: asset mint.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: token program.
    pub token_program: UncheckedAccount<'info>,
    /// CHECK: TSN-owned signer PDA.
    pub tcap_authorization_signer: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<RegisterTcapExitAuthorizationV1>, args: RegisterTcapExitAuthorizationV1Args) -> Result<()> {
    require!(args.authorization_digest != [0; 32] && args.previous_commitment != [0; 32] && args.new_commitment != [0; 32] && args.nullifier != [0; 32] && args.exit_amount > 0, TsnError::Unauthorized);
    let (expected, bump) = Pubkey::find_program_address(&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest], &crate::ID);
    require_keys_eq!(expected, ctx.accounts.tcap_authorization_signer.key(), TsnError::Unauthorized);
    let data = ExitTcapTipV1::data(&tcap::instruction::ExitTcapTipV1 { args: tcap::instructions::exit_tcap_tip_v1::ExitTcapTipV1Args {
        authorization_digest: args.authorization_digest, valid_after_slot: args.valid_after_slot, expires_at_slot: args.expires_at_slot,
        previous_commitment: args.previous_commitment, new_commitment: args.new_commitment, sequence: args.sequence,
        token_id: args.token_id, policy_commitment: args.policy_commitment, nullifier: args.nullifier, exit_amount: args.exit_amount,
    }});
    let ix = Instruction { program_id: TCAP_PROGRAM_ID, accounts: vec![
        AccountMeta::new(ctx.accounts.authority.key(), true), AccountMeta::new_readonly(ctx.accounts.tcap_config.key(), false),
        AccountMeta::new(ctx.accounts.current_tip.key(), false), AccountMeta::new_readonly(ctx.accounts.asset_entry.key(), false),
        AccountMeta::new(ctx.accounts.reserve_state.key(), false), AccountMeta::new(ctx.accounts.liability.key(), false),
        AccountMeta::new_readonly(ctx.accounts.reserve_authority.key(), false), AccountMeta::new(ctx.accounts.vault.key(), false),
        AccountMeta::new(ctx.accounts.destination.key(), false), AccountMeta::new_readonly(ctx.accounts.destination_owner.key(), false),
        AccountMeta::new_readonly(ctx.accounts.mint.key(), false), AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
        AccountMeta::new_readonly(ctx.accounts.tcap_authorization_signer.key(), true),
    ], data };
    invoke_signed(&ix, &[
        ctx.accounts.authority.to_account_info(), ctx.accounts.tcap_config.to_account_info(), ctx.accounts.current_tip.to_account_info(),
        ctx.accounts.asset_entry.to_account_info(), ctx.accounts.reserve_state.to_account_info(), ctx.accounts.liability.to_account_info(),
        ctx.accounts.reserve_authority.to_account_info(), ctx.accounts.vault.to_account_info(), ctx.accounts.destination.to_account_info(),
        ctx.accounts.destination_owner.to_account_info(), ctx.accounts.mint.to_account_info(), ctx.accounts.token_program.to_account_info(),
        ctx.accounts.tcap_authorization_signer.to_account_info(), ctx.accounts.tcap_program.to_account_info(),
    ], &[&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest, &[bump]]])?;
    Ok(())
}
