use anchor_lang::{prelude::*, Discriminator};
use anchor_lang::solana_program::{program::invoke, system_instruction};

use crate::{authority::{TCAP_ASSET_REGISTRY_SEED, TCAP_COMMITMENT_ROOT_SEED, TCAP_GLOBAL_CONFIG_SEED}, error::TcapError, state::{TcapGlobalConfigV1, TcapMigrationStateV1}};

pub const TSN_PROGRAM_ID: Pubkey = pubkey!("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");

#[derive(Accounts)]
pub struct MigrateTcapConfigLayoutV1<'info> {
    #[account(mut)]
    pub governance: Signer<'info>,
    /// CHECK: The legacy account is decoded and rewritten explicitly below.
    #[account(mut, seeds = [TCAP_GLOBAL_CONFIG_SEED], bump)]
    pub config: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigrateTcapConfigLayoutV1>) -> Result<()> {
    let config = &ctx.accounts.config;
    require_keys_eq!(*config.owner, crate::ID, TcapError::InvalidPda);
    let mut data = config.try_borrow_data()?.to_vec();
    require!(data.len() >= 244, TcapError::InvalidPda);
    require!(data[..8] == TcapGlobalConfigV1::DISCRIMINATOR, TcapError::InvalidPda);
    let legacy_governance = Pubkey::try_from(&data[14..46]).map_err(|_| error!(TcapError::InvalidAuthority))?;
    require_keys_eq!(legacy_governance, ctx.accounts.governance.key(), TcapError::InvalidAuthority);

    let (registry, _) = Pubkey::find_program_address(&[TCAP_ASSET_REGISTRY_SEED], &crate::ID);
    let (root, _) = Pubkey::find_program_address(&[TCAP_COMMITMENT_ROOT_SEED], &crate::ID);
    // The legacy deployment did not serialize the proof flags before the root
    // field. Preserve governance, retain the legacy emergency authority where
    // present, and bind the canonical registry/root/TSN identities.
    let emergency = Pubkey::try_from(&data[110..142]).unwrap_or(TSN_PROGRAM_ID);
    let migrated = TcapGlobalConfigV1 {
        version: 1,
        protocol_version: u16::from_le_bytes([data[10], data[11]]),
        minimum_instruction_version: u16::from_le_bytes([data[12], data[13]]),
        governance_authority: legacy_governance,
        registry_authority: legacy_governance,
        asset_registry: registry,
        emergency_authority: emergency,
        approved_tsn_program: TSN_PROGRAM_ID,
        proof_verifier_program: Pubkey::default(),
        proof_verifier_enabled: false,
        paused: false,
        commitment_root_state: root,
        domain_version: 1,
        migration_state: TcapMigrationStateV1::Development,
        bump: ctx.bumps.config,
    };

    let encoded = migrated.try_to_vec()?;
    let target_len = TcapGlobalConfigV1::SPACE;
    let rent = Rent::get()?.minimum_balance(target_len);
    if config.lamports() < rent {
        let top_up = rent - config.lamports();
        invoke(&system_instruction::transfer(&ctx.accounts.governance.key(), &config.key(), top_up), &[ctx.accounts.governance.to_account_info(), config.to_account_info(), ctx.accounts.system_program.to_account_info()])?;
    }
    config.to_account_info().realloc(target_len, true)?;
    let mut out = config.try_borrow_mut_data()?;
    out[..8].copy_from_slice(&TcapGlobalConfigV1::DISCRIMINATOR);
    out[8..8 + encoded.len()].copy_from_slice(&encoded);
    emit!(ConfigLayoutMigratedV1 { config: config.key(), governance: legacy_governance, target_len: target_len as u32 });
    Ok(())
}

#[event]
pub struct ConfigLayoutMigratedV1 {
    pub config: Pubkey,
    pub governance: Pubkey,
    pub target_len: u32,
}
