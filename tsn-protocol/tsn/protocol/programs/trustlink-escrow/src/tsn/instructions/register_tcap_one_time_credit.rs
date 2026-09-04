use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};
use anchor_lang::InstructionData;
use tcap::instruction::CreditOneTimeTip;
use crate::tsn::{constants::{TSN_MOTHER_ESCROW_SEED, TSN_TCAP_AUTHORITY_SEED}, errors::TsnError, state::MotherEscrow};

pub const TCAP_PROGRAM_ID: Pubkey = pubkey!("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct RegisterTcapOneTimeCreditArgs {
    pub authorization_digest: [u8; 32], pub valid_after_slot: u64, pub expires_at_slot: u64,
    pub next_commitment: [u8; 32], pub nonce: [u8; 32], pub sequence: u64, pub token_id: u32, pub amount: u64,
    pub policy_commitment: [u8; 32], pub gpru_scope_commitment: [u8; 32],
    pub previous_commitment: [u8; 32],
}

#[derive(Accounts)]
pub struct RegisterTcapOneTimeCredit<'info> {
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
    /// CHECK: canonical per-tip liability.
    pub liability: UncheckedAccount<'info>,
    /// CHECK: TSN-owned signer PDA.
    pub tcap_authorization_signer: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<RegisterTcapOneTimeCredit>, args: RegisterTcapOneTimeCreditArgs) -> Result<()> {
    require!(args.authorization_digest != [0; 32] && args.next_commitment != [0; 32] && args.nonce != [0; 32] && args.amount > 0, TsnError::Unauthorized);
    let (expected, bump) = Pubkey::find_program_address(&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest], &crate::ID);
    require_keys_eq!(expected, ctx.accounts.tcap_authorization_signer.key(), TsnError::Unauthorized);
    // Build the CPI payload with the tcap crate's own Anchor instruction type.
    // InstructionData::data() emits the instantiated flattened argument list
    // plus the 8-byte Anchor discriminator, exactly matching the on-chain ABI.
    let data = CreditOneTimeTip::data(&tcap::instruction::CreditOneTimeTip {
        authorization_digest: args.authorization_digest,
        previous_commitment: args.previous_commitment,
        new_commitment: args.next_commitment,
        policy_commitment: args.policy_commitment,
        nonce: args.nonce,
        sequence: args.sequence,
        token_id: args.token_id,
        amount: args.amount,
        valid_after_slot: args.valid_after_slot,
        expires_at_slot: args.expires_at_slot,
    });
    let ix = Instruction { program_id: TCAP_PROGRAM_ID, accounts: vec![
        AccountMeta::new(ctx.accounts.authority.key(), true), AccountMeta::new_readonly(ctx.accounts.tcap_config.key(), false),
        AccountMeta::new(ctx.accounts.current_tip.key(), false), AccountMeta::new_readonly(ctx.accounts.asset_entry.key(), false),
        AccountMeta::new(ctx.accounts.reserve_state.key(), false), AccountMeta::new(ctx.accounts.liability.key(), false),
        AccountMeta::new_readonly(ctx.accounts.tsn_program.key(), false),
        AccountMeta::new_readonly(ctx.accounts.tcap_authorization_signer.key(), true),
    ], data };
    invoke_signed(&ix, &[
        ctx.accounts.authority.to_account_info(), ctx.accounts.tcap_config.to_account_info(), ctx.accounts.current_tip.to_account_info(),
        ctx.accounts.asset_entry.to_account_info(), ctx.accounts.reserve_state.to_account_info(), ctx.accounts.liability.to_account_info(), ctx.accounts.tsn_program.to_account_info(), ctx.accounts.tcap_authorization_signer.to_account_info(),
        ctx.accounts.tcap_program.to_account_info(),
    ], &[&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest, &[bump]]])?;
    Ok(())
}
