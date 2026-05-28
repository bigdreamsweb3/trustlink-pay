use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    hash::hash,
    program::set_return_data,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::instructions::{
        load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID,
    },
};

use crate::{
    error::Error,
    instruction_auto::ResolveTinParams,
    state::TinAccount,
    utils::{assert_pda, assert_program_owned, load_borsh},
};

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: ResolveTinParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let identity = next_account_info(accounts_iter)?;
    let instructions_sysvar = next_account_info(accounts_iter)?;

    // 1. Validate instructions sysvar account
    if *instructions_sysvar.key != INSTRUCTIONS_ID {
        return Err(ProgramError::InvalidArgument);
    }

    // 2. Perform signature-gated ownership verification via instructions sysvar
    let current_index = load_current_index_checked(instructions_sysvar)? as usize;

    let mut verified = false;
    for i in 0..current_index {
        if let Ok(ix) = load_instruction_at_checked(i, instructions_sysvar) {
            if ix.program_id == solana_program::ed25519_program::ID {
                if verify_ed25519_ix_data(&ix.data, &params.wallet_pubkey, &params.challenge_nonce) {
                    verified = true;
                    break;
                }
            }
        }
    }

    if !verified {
        return Err(Error::SignatureVerificationFailed.into());
    }

    // 3. Derive deterministic identity seed and PDA internally
    let mut hasher_input = Vec::new();
    hasher_input.extend_from_slice(params.wallet_pubkey.as_ref());
    hasher_input.extend_from_slice(crate::PROGRAM_SALT);
    let identity_seed = hash(&hasher_input).to_bytes();

    let (expected_identity_pubkey, _bump) = crate::identity_pda(program_id, &identity_seed);
    assert_pda(identity, &expected_identity_pubkey)?;
    assert_program_owned(identity, program_id)?;

    // 4. Load TinAccount and verify
    let tin_account: TinAccount = load_borsh(identity)?;
    
    // 5. Securely return TIN u64 as program return data
    set_return_data(&tin_account.tin.to_le_bytes());

    Ok(())
}

fn verify_ed25519_ix_data(
    data: &[u8],
    expected_pubkey: &Pubkey,
    expected_message: &[u8; 32],
) -> bool {
    if data.len() < 112 {
        return false;
    }
    let num_signatures = data[0];
    if num_signatures != 1 {
        return false;
    }

    let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let message_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_size = u16::from_le_bytes([data[12], data[13]]) as usize;

    if pubkey_offset + 32 > data.len() || message_offset + message_size > data.len() {
        return false;
    }

    let parsed_pubkey = &data[pubkey_offset..pubkey_offset + 32];
    let parsed_message = &data[message_offset..message_offset + message_size];

    parsed_pubkey == expected_pubkey.as_ref() && parsed_message == expected_message.as_ref()
}
