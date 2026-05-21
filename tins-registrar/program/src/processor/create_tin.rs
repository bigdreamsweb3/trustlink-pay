use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    hash::hash,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::Sysvar,
};

use crate::{
    cpi::create_pda_account,
    error::Error,
    instruction_auto::CreateTinParams,
    state::{TinAccount, GlobalState},
    utils::{assert_pda, assert_program_owned, load_borsh, next_tin, store_borsh, validate_name},
};

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: CreateTinParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let payer = next_account_info(accounts_iter)?;
    let global_state = next_account_info(accounts_iter)?;
    let identity = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    validate_name(&params.display_name)?;
    assert_program_owned(global_state, program_id)?;
    if !identity.data_is_empty() {
        return Err(Error::RegistryAlreadyInitialized.into());
    }

    // 1. Derive identity seed deterministically
    let mut hasher_input = Vec::new();
    hasher_input.extend_from_slice(payer.key.as_ref());
    hasher_input.extend_from_slice(crate::PROGRAM_SALT);
    let identity_seed = hash(&hasher_input).to_bytes();

    // 2. Derive expected identity pubkey PDA
    let (expected_identity_pubkey, bump) = crate::identity_pda(program_id, &identity_seed);
    assert_pda(identity, &expected_identity_pubkey)?;

    // 3. Load global state and generate new 10-digit TIN
    let mut global: GlobalState = load_borsh(global_state)?;
    let tin = next_tin(&global)?;

    // 4. Create PDA account
    let signer_seeds: [&[u8]; 3] = [
        crate::seeds::IDENTITY,
        &identity_seed,
        &[bump],
    ];
    let space = TinAccount::space(&params.display_name, params.encrypted_phone.len());
    create_pda_account(
        payer,
        identity,
        system_program,
        program_id,
        space,
        0,
        &signer_seeds,
    )?;

    // 5. Store TinAccount data on-chain
    let tin_account = TinAccount {
        tin,
        display_name: params.display_name,
        identity_pubkey: *identity.key,
        encrypted_phone: params.encrypted_phone,
        created_at: Clock::get()?.unix_timestamp,
    };
    store_borsh(identity, &tin_account)?;

    // 6. Update global state sequence
    global.next_sequence = global
        .next_sequence
        .checked_add(1)
        .ok_or(Error::Overflow)?;
    store_borsh(global_state, &global)
}
