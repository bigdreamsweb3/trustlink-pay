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
    instruction_auto::InitializeIdentityParams,
    state::{IdentityRegistry, GlobalState, CURRENT_VERSION, IDENTITY_ACTIVE},
    utils::{assert_pda, assert_program_owned, load_borsh, next_tin, store_borsh, validate_name},
};

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: InitializeIdentityParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let payer = next_account_info(accounts_iter)?;
    let global_state = next_account_info(accounts_iter)?;
    let registry = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    validate_name(&params.name)?;
    assert_program_owned(global_state, program_id)?;
    if !registry.data_is_empty() {
        return Err(Error::RegistryAlreadyInitialized.into());
    }

    let mut global: GlobalState = load_borsh(global_state)?;
    let tin = next_tin(&global)?;
    let (expected_registry, bump) = crate::registry_pda(program_id, tin);
    assert_pda(registry, &expected_registry)?;

    let tin_bytes = tin.to_le_bytes();
    let signer_seeds: [&[u8]; 3] = [crate::seeds::REGISTRY, &tin_bytes, &[bump]];
    create_pda_account(
        payer,
        registry,
        system_program,
        program_id,
        IdentityRegistry::space(&params.name),
        0,
        &signer_seeds,
    )?;

    let registry_state = IdentityRegistry {
        version: CURRENT_VERSION,
        bump,
        status: IDENTITY_ACTIVE,
        reserved: [0; 5],
        tin,
        authority: *payer.key,
        master_privacy: params.master_privacy,
        last_escrow_id: 0,
        created_at: Clock::get()?.unix_timestamp,
        name: params.name,
    };
    store_borsh(registry, &registry_state)?;

    global.next_sequence = global
        .next_sequence
        .checked_add(1)
        .ok_or(Error::Overflow)?;
    store_borsh(global_state, &global)
}
