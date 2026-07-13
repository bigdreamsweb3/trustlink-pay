use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    hash::hash,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::{
        instructions::{load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID},
        Sysvar,
    },
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
    let cranker = next_account_info(accounts_iter)?;
    let global_state = next_account_info(accounts_iter)?;
    let identity = next_account_info(accounts_iter)?;
    let instructions_sysvar = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    if !cranker.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    validate_name(&params.display_name)?;
    if Clock::get()?.unix_timestamp > params.expiry_ts {
        return Err(Error::InvalidInstruction.into());
    }
    if *instructions_sysvar.key != INSTRUCTIONS_ID {
        return Err(ProgramError::InvalidArgument);
    }
    assert_program_owned(global_state, program_id)?;
    if !identity.data_is_empty() {
        return Err(Error::RegistryAlreadyInitialized.into());
    }

    // 1. Derive identity seed deterministically
    let mut hasher_input = Vec::new();
    hasher_input.extend_from_slice(params.owner_pubkey.as_ref());
    hasher_input.extend_from_slice(crate::PROGRAM_SALT);
    let identity_seed = hash(&hasher_input).to_bytes();

    // 2. Derive expected identity pubkey PDA
    let (expected_identity_pubkey, bump) = crate::identity_pda(program_id, &identity_seed);
    assert_pda(identity, &expected_identity_pubkey)?;

    if !verify_owner_intent(instructions_sysvar, &params.owner_pubkey, &params.intent_hash)? {
        return Err(Error::SignatureVerificationFailed.into());
    }
    let owner_pubkey_hash = hash(params.owner_pubkey.as_ref()).to_bytes();

    // 3. Load global state and generate new 10-digit TIN
    let mut global: GlobalState = load_borsh(global_state)?;
    let tin = next_tin(&global)?;

    // 4. Create PDA account
    let signer_seeds: [&[u8]; 3] = [
        crate::seeds::IDENTITY,
        &identity_seed,
        &[bump],
    ];
    let space = TinAccount::space(&params.display_name, params.encrypted_master_seed.len());
    create_pda_account(
        cranker,
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
        owner_pubkey_hash,
        encrypted_master_seed: params.encrypted_master_seed,
        created_at: Clock::get()?.unix_timestamp,
        encrypted_metadata_hash: params.encrypted_metadata_hash,
        pru_configuration_hash: params.pru_configuration_hash,
    };
    store_borsh(identity, &tin_account)?;

    // 6. Update global state sequence
    global.next_sequence = global
        .next_sequence
        .checked_add(1)
        .ok_or(Error::Overflow)?;
    store_borsh(global_state, &global)
}

fn verify_owner_intent(instructions_sysvar: &AccountInfo, owner: &Pubkey, intent_hash: &[u8; 32]) -> Result<bool, ProgramError> {
    let current_index = load_current_index_checked(instructions_sysvar)? as usize;
    for i in 0..current_index {
        if let Ok(ix) = load_instruction_at_checked(i, instructions_sysvar) {
            if ix.program_id == solana_program::ed25519_program::ID && verify_ed25519_ix_data(&ix.data, owner, intent_hash) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn verify_ed25519_ix_data(data: &[u8], expected_pubkey: &Pubkey, expected_message: &[u8; 32]) -> bool {
    if data.len() < 112 || data[0] != 1 {
        return false;
    }
    let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let message_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_size = u16::from_le_bytes([data[12], data[13]]) as usize;
    if pubkey_offset + 32 > data.len() || message_offset + message_size > data.len() {
        return false;
    }
    if &data[pubkey_offset..pubkey_offset + 32] != expected_pubkey.as_ref() {
        return false;
    }
    let parsed_message = &data[message_offset..message_offset + message_size];
    parsed_message == expected_message.as_ref()
        || hash(parsed_message).to_bytes() == *expected_message
}
