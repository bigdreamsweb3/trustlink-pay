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
    instruction_auto::{
        InitializePlatformRegistryParams, RemoveVerificationPlatformParams,
        UpsertVerificationPlatformParams,
    },
    state::{PlatformRegistry, VerificationPlatform, CURRENT_VERSION, PLATFORM_ACTIVE, PLATFORM_INACTIVE},
    utils::{assert_pda, assert_program_owned, store_borsh, top_up_and_realloc, validate_identity_type},
};

pub fn initialize(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _params: InitializePlatformRegistryParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let authority = next_account_info(accounts_iter)?;
    let platform_registry = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !platform_registry.data_is_empty() {
        return Err(Error::RegistryAlreadyInitialized.into());
    }

    let (expected_registry, bump) = crate::platform_registry_pda(program_id);
    assert_pda(platform_registry, &expected_registry)?;

    let signer_seeds: [&[u8]; 2] = [crate::seeds::PLATFORM_REGISTRY, &[bump]];
    create_pda_account(
        authority,
        platform_registry,
        system_program,
        program_id,
        PlatformRegistry::base_space(),
        0,
        &signer_seeds,
    )?;

    let registry = PlatformRegistry {
        version: CURRENT_VERSION,
        bump,
        authority: *authority.key,
        platforms: Vec::new(),
        reserved: [0; 6],
    };
    store_borsh(platform_registry, &registry)
}

pub fn upsert_platform(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: UpsertVerificationPlatformParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let authority = next_account_info(accounts_iter)?;
    let platform_registry = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    validate_identity_type(&params.platform_id)?;
    assert_program_owned(platform_registry, program_id)?;

    let mut registry: PlatformRegistry = crate::utils::load_borsh(platform_registry)?;
    if registry.authority != *authority.key {
        return Err(Error::UnauthorizedClaimant.into());
    }

    if let Some(existing) = registry
        .platforms
        .iter_mut()
        .find(|platform| platform.public_key == params.platform_pubkey)
    {
        existing.platform_id = params.platform_id;
        existing.status = PLATFORM_ACTIVE;
        existing.rotated_from = params.rotated_from;
    } else {
        registry.platforms.push(VerificationPlatform {
            platform_id: params.platform_id,
            public_key: params.platform_pubkey,
            status: PLATFORM_ACTIVE,
            added_at: Clock::get()?.unix_timestamp,
            rotated_from: params.rotated_from,
        });
    }

    top_up_and_realloc(authority, platform_registry, system_program, registry.space())?;
    store_borsh(platform_registry, &registry)
}

pub fn remove_platform(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: RemoveVerificationPlatformParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let authority = next_account_info(accounts_iter)?;
    let platform_registry = next_account_info(accounts_iter)?;

    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    assert_program_owned(platform_registry, program_id)?;

    let mut registry: PlatformRegistry = crate::utils::load_borsh(platform_registry)?;
    if registry.authority != *authority.key {
        return Err(Error::UnauthorizedClaimant.into());
    }

    let platform = registry
        .platforms
        .iter_mut()
        .find(|platform| platform.public_key == params.platform_pubkey)
        .ok_or(Error::InvalidInstruction)?;
    platform.status = PLATFORM_INACTIVE;
    store_borsh(platform_registry, &registry)
}
