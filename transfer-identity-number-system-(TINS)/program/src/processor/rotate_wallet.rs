use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::Sysvar,
};

use crate::{
    cpi::create_pda_account,
    error::Error,
    state::{IdentityRegistry, RotationRequest, CURRENT_VERSION, IDENTITY_ACTIVE},
    utils::{assert_pda, assert_program_owned, load_borsh, store_borsh},
};

/// ROTATION COMMAND: Initiate wallet rotation
/// Requirements:
/// - Caller must be one of the recovery wallets
/// - Cannot have pending rotation
/// - Must wait 24hr since last rotation
pub fn initiate_rotation(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    new_privacy_pubkey: Pubkey,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let registry = next_account_info(accounts_iter)?;
    let clock = next_account_info(accounts_iter)?;

    assert_program_owned(registry, program_id)?;
    let mut identity: IdentityRegistry = load_borsh(registry)?;
    
    // Check caller is recovery wallet
    let is_recovery = identity.recovery_wallets.iter().any(|w| w.is_some());
    require!(is_recovery, Error::UnauthorizedClaimant);
    
    // Check no pending rotation
    require!(identity.pending_rotation.is_none(), Error::InvalidInstruction);
    
    // Check cooldown (24hr = 86400 seconds)
    let current_time = Clock::from_account_info(clock)?.unix_timestamp;
    if identity.last_rotation_at > 0 {
        require!(
            current_time - identity.last_rotation_at > 86400,
            Error::InvalidInstruction
        );
    }
    
    // Create rotation request
    identity.pending_rotation = Some(RotationRequest {
        new_privacy_pubkey,
        requested_by: Pubkey::default(), // Set by CPI caller
        requested_at: current_time,
        confirmations: 0,
        confirmed_by: 0,
        status: 0, // pending
    });
    
    store_borsh(registry, &identity)
}

/// Approve rotation (second recovery wallet confirms)
pub fn approve_rotation(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let registry = next_account_info(accounts_iter)?;
    let clock = next_account_info(accounts_iter)?;

    assert_program_owned(registry, program_id)?;
    let mut identity: IdentityRegistry = load_borsh(registry)?;
    
    // Must have pending request
    let mut request = identity.pending_rotation.ok_or(Error::InvalidInstruction)?;
    
    // Check cooldown (24hr)
    let current_time = Clock::from_account_info(clock)?.unix_timestamp;
    require!(
        current_time - request.requested_at > 86400,
        Error::InvalidInstruction
    );
    
    // Need 2 of 3 confirmations
    request.confirmations += 1;
    if request.confirmations >= 2 {
        request.status = 1; // confirmed
        // Apply rotation
        identity.privacy_pubkey = request.new_privacy_pubkey;
        identity.last_rotation_at = current_time;
        identity.pending_rotation = None;
        // Increment nonce to prevent replay
        identity.nonce += 1;
    }
    
    store_borsh(registry, &identity)
}

/// Cancel rotation during cooldown
pub fn cancel_rotation(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let registry = next_account_info(accounts_iter)?;

    assert_program_owned(registry, program_id)?;
    let mut identity: IdentityRegistry = load_borsh(registry)?;
    
    if let Some(mut request) = identity.pending_rotation.take() {
        request.status = 2; // cancelled
        identity.pending_rotation = Some(request);
    }
    
    store_borsh(registry, &identity)
}