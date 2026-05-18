//! Account contexts for TINS instructions

use crate::state::{GlobalConfig, IdentityRecord, IdentityType, LinkedIdentity, RateLimit};
use anchor_lang::prelude::*;

/// Initialize config - called once
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    /// Config PDA
    #[account(
        init,
        seeds = [b"config"],
        bump,
        payer = authority,
        space = 8 + GlobalConfig::INIT_SPACE,
    )]
    pub global_config: Account<'info, GlobalConfig>,
    /// Authority (signer)
    #[account(mut)]
    pub authority: Signer<'info>,
    /// System program
    pub system_program: Program<'info, System>,
}

/// Register new TIN
#[derive(Accounts)]
pub struct RegisterTin<'info> {
    /// Identity record PDA - seed by TIN number
    #[account(
        init,
        seeds = [b"identity", &tin.to_le_bytes()[..8]],
        bump,
        payer = signer,
        space = 8 + IdentityRecord::INIT_SPACE,
    )]
    pub identity: Account<'info, IdentityRecord>,
    /// Rate limit PDA
    #[account(
        init_if_needed,
        seeds = [b"rate", signer.key().as_ref()],
        bump,
        payer = signer,
        space = 8 + RateLimit::INIT_SPACE,
    )]
    pub rate_limit: Account<'info, RateLimit>,
    /// Linked identity (optional) - seed by identity hash
    #[account(
        init_if_needed,
        seeds = [b"linked", identity_hash.as_ref().unwrap_or(&[0u8; 32])],
        bump,
        payer = signer,
        space = 8 + LinkedIdentity::INIT_SPACE,
    )]
    pub linked_identity: Option<Account<'info, LinkedIdentity>>,
    /// Global config
    #[account(
        seeds = [b"config"],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,
    /// Signer (paying for account)
    #[account(mut)]
    pub signer: Signer<'info>,
    /// Clock for timestamp
    pub clock: Sysvar<'info, Clock>,
    /// System program
    pub system_program: Program<'info, System>,
}

/// Update display name
#[derive(Accounts)]
pub struct UpdateDisplayName<'info> {
    /// Identity record
    #[account(
        mut,
        seeds = [b"identity", &identity.tin.to_le_bytes()[..8]],
        bump = identity.bump,
        has_one = owner,
    )]
    pub identity: Account<'info, IdentityRecord>,
    /// Owner (signer)
    pub owner: Signer<'info>,
}

/// Set frozen status
#[derive(Accounts)]
pub struct SetFrozen<'info> {
    #[account(
        mut,
        seeds = [b"identity", &identity.tin.to_le_bytes()[..8]],
        bump = identity.bump,
        has_one = owner,
    )]
    pub identity: Account<'info, IdentityRecord>,
    pub owner: Signer<'info>,
}

/// Verify linked identity
#[derive(Accounts)]
pub struct VerifyLinkedIdentity<'info> {
    #[account(
        mut,
        seeds = [b"identity", &identity.tin.to_le_bytes()[..8]],
        bump = identity.bump,
        has_one = owner,
    )]
    pub identity: Account<'info, IdentityRecord>,
    #[account(
        mut,
        seeds = [b"linked", &identity.identity_hash],
        bump,
    )]
    pub linked_identity: Account<'info, LinkedIdentity>,
    pub owner: Signer<'info>,
}

/// Find identity by TIN
#[derive(Accounts)]
pub struct FindByTin<'info> {
    #[account(
        seeds = [b"identity", &tin.to_le_bytes()[..8]],
        bump,
    )]
    pub identity: Account<'info, IdentityRecord>,
}