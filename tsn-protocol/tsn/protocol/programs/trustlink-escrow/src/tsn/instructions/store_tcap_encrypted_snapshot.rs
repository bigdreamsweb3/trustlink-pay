use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};
use crate::tsn::{constants::{TSN_MOTHER_ESCROW_SEED, TSN_TCAP_AUTHORITY_SEED}, errors::TsnError, state::MotherEscrow};

pub const TCAP_PROGRAM_ID: Pubkey = pubkey!("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StoreTcapEncryptedSnapshotArgs {
    pub authorization_digest: [u8; 32],
    pub commitment: [u8; 32],
    pub owner_binding: [u8; 32],
    pub sequence: u64,
    pub nonce: [u8; 12],
    pub ciphertext_commitment: [u8; 32],
    pub ciphertext: Vec<u8>,
}

#[derive(Accounts)]
pub struct StoreTcapEncryptedSnapshot<'info> {
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
    pub one_time_tip: UncheckedAccount<'info>,
    /// CHECK: snapshot PDA initialized by TCAP.
    pub snapshot: UncheckedAccount<'info>,
    /// CHECK: TSN-owned signer PDA.
    pub tcap_authorization_signer: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<StoreTcapEncryptedSnapshot>, args: StoreTcapEncryptedSnapshotArgs) -> Result<()> {
    require!(args.authorization_digest != [0; 32] && args.commitment != [0; 32], TsnError::Unauthorized);
    require!(args.owner_binding != [0; 32] && args.ciphertext_commitment != [0; 32] && !args.ciphertext.is_empty(), TsnError::Unauthorized);
    let (expected, bump) = Pubkey::find_program_address(&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest], &crate::ID);
    require_keys_eq!(expected, ctx.accounts.tcap_authorization_signer.key(), TsnError::Unauthorized);
    let mut data = anchor_lang::solana_program::hash::hash(b"global:store_encrypted_snapshot").to_bytes()[..8].to_vec();
    data.extend_from_slice(&args.try_to_vec()?);
    let ix = Instruction { program_id: TCAP_PROGRAM_ID, accounts: vec![
        AccountMeta::new(ctx.accounts.authority.key(), true),
        AccountMeta::new_readonly(ctx.accounts.tcap_config.key(), false),
        AccountMeta::new(ctx.accounts.one_time_tip.key(), false),
        AccountMeta::new(ctx.accounts.snapshot.key(), false),
        AccountMeta::new_readonly(anchor_lang::solana_program::system_program::ID, false),
        AccountMeta::new_readonly(ctx.accounts.tsn_program.key(), false),
        AccountMeta::new_readonly(ctx.accounts.tcap_authorization_signer.key(), true),
    ], data };
    invoke_signed(&ix, &[
        ctx.accounts.authority.to_account_info(), ctx.accounts.tcap_config.to_account_info(),
        ctx.accounts.one_time_tip.to_account_info(), ctx.accounts.snapshot.to_account_info(),
        ctx.accounts.system_program.to_account_info(), ctx.accounts.tsn_program.to_account_info(),
        ctx.accounts.tcap_authorization_signer.to_account_info(), ctx.accounts.tcap_program.to_account_info(),
    ], &[&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest, &[bump]]])?;
    Ok(())
}
