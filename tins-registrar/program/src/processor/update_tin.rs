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
    error::Error,
    instruction_auto::UpdateTinParams,
    state::TinAccount,
    utils::{assert_pda, assert_program_owned, load_borsh, store_borsh, validate_name},
};

pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], params: UpdateTinParams) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let cranker = next_account_info(accounts_iter)?;
    let identity = next_account_info(accounts_iter)?;
    let instructions_sysvar = next_account_info(accounts_iter)?;

    if !cranker.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if *instructions_sysvar.key != INSTRUCTIONS_ID {
        return Err(ProgramError::InvalidArgument);
    }
    if Clock::get()?.unix_timestamp > params.expiry_ts {
        return Err(Error::InvalidInstruction.into());
    }
    if params.privacy_level != 3 {
        return Err(Error::InvalidInstruction.into());
    }
    validate_name(&params.display_name)?;

    let mut hasher_input = Vec::new();
    hasher_input.extend_from_slice(params.owner_pubkey.as_ref());
    hasher_input.extend_from_slice(crate::PROGRAM_SALT);
    let identity_seed = hash(&hasher_input).to_bytes();
    let (expected_identity_pubkey, _bump) = crate::identity_pda(program_id, &identity_seed);
    assert_pda(identity, &expected_identity_pubkey)?;
    assert_program_owned(identity, program_id)?;

    if !verify_owner_intent(instructions_sysvar, &params.owner_pubkey, &params.intent_hash)? {
        return Err(Error::SignatureVerificationFailed.into());
    }

    let mut tin_account: TinAccount = load_borsh(identity)?;
    if tin_account.owner_pubkey != params.owner_pubkey {
        return Err(Error::SignatureVerificationFailed.into());
    }

    tin_account.display_name = params.display_name;
    tin_account.encrypted_phone = params.encrypted_phone;
    tin_account.privacy_level = params.privacy_level;
    tin_account.encrypted_metadata_hash = params.encrypted_metadata_hash;
    tin_account.pru_configuration_hash = params.pru_configuration_hash;
    store_borsh(identity, &tin_account)
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
    &data[pubkey_offset..pubkey_offset + 32] == expected_pubkey.as_ref()
        && &data[message_offset..message_offset + message_size] == expected_message.as_ref()
}
