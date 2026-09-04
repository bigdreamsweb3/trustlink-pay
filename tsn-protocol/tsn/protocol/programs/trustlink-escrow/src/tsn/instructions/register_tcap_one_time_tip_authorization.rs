use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};
use crate::tsn::{constants::{TSN_MOTHER_ESCROW_SEED, TSN_TCAP_AUTHORITY_SEED}, errors::TsnError, state::MotherEscrow};

pub const TCAP_PROGRAM_ID: Pubkey = pubkey!("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct RegisterTcapOneTimeTipAuthorizationArgs {
    pub authorization_digest: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub next_commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub sequence: u64,
    pub amount: u64,
    pub policy_commitment: [u8; 32],
    pub gpru_scope_commitment: [u8; 32],
}

#[derive(Accounts)]
pub struct RegisterTcapOneTimeTipAuthorization<'info> {
    #[account(mut)] pub authority: Signer<'info>,
    #[account(seeds = [TSN_MOTHER_ESCROW_SEED], bump = mother_escrow.bump, constraint = mother_escrow.authority == authority.key() @ TsnError::Unauthorized)]
    pub mother_escrow: Account<'info, MotherEscrow>,
    /// CHECK: governed TCAP executable.
    #[account(executable, address = TCAP_PROGRAM_ID)] pub tcap_program: UncheckedAccount<'info>,
    /// CHECK: this program executable.
    #[account(executable, address = crate::ID)] pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: validated by TCAP.
    pub tcap_config: UncheckedAccount<'info>,
    /// CHECK: one-time TIP account validated by TCAP.
    pub one_time_tip: UncheckedAccount<'info>,
    /// CHECK: successor one-time TIP initialized by TCAP.
    pub next_tip: UncheckedAccount<'info>,
    /// CHECK: TSN-owned signer PDA.
    pub tcap_authorization_signer: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterTcapOneTimeTipAuthorization>, args: RegisterTcapOneTimeTipAuthorizationArgs) -> Result<()> {
    require!(args.authorization_digest != [0; 32] && args.next_commitment != [0; 32] && args.nullifier != [0; 32], TsnError::Unauthorized);
    require!(args.policy_commitment != [0; 32] && args.gpru_scope_commitment != [0; 32] && args.amount > 0, TsnError::Unauthorized);
    require!(args.sequence > 0 && args.expires_at_slot >= args.valid_after_slot, TsnError::Unauthorized);
    let (expected, bump) = Pubkey::find_program_address(&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest], &crate::ID);
    require_keys_eq!(expected, ctx.accounts.tcap_authorization_signer.key(), TsnError::Unauthorized);
    let mut data = anchor_lang::solana_program::hash::hash(b"global:consume_one_time_tip").to_bytes()[..8].to_vec();
    data.extend_from_slice(&args.try_to_vec()?);
    let instruction = Instruction { program_id: TCAP_PROGRAM_ID, accounts: vec![
        AccountMeta::new(ctx.accounts.authority.key(), true),
        AccountMeta::new_readonly(ctx.accounts.tcap_config.key(), false),
        AccountMeta::new(ctx.accounts.one_time_tip.key(), false),
        AccountMeta::new(ctx.accounts.next_tip.key(), false),
        AccountMeta::new_readonly(ctx.accounts.tsn_program.key(), false),
        AccountMeta::new_readonly(ctx.accounts.tcap_authorization_signer.key(), true),
        AccountMeta::new_readonly(anchor_lang::solana_program::system_program::ID, false),
    ], data };
    invoke_signed(&instruction, &[
        ctx.accounts.authority.to_account_info(), ctx.accounts.tcap_config.to_account_info(),
        ctx.accounts.one_time_tip.to_account_info(), ctx.accounts.next_tip.to_account_info(),
        ctx.accounts.tsn_program.to_account_info(), ctx.accounts.tcap_authorization_signer.to_account_info(),
        ctx.accounts.system_program.to_account_info(), ctx.accounts.tcap_program.to_account_info(),
    ], &[&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest, &[bump]]])?;
    Ok(())
}
