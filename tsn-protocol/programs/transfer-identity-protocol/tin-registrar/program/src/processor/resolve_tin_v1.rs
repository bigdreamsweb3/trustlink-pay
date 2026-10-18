use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    hash::hash,
    program::set_return_data,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID},
};

use crate::{error::Error, instruction_auto::ResolveTinV1Params, state::TinV1Account, utils::{assert_pda, assert_program_owned, load_borsh_with_zero_padding}};

pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], params: ResolveTinV1Params) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let registry = next_account_info(accounts_iter)?;
    let instructions_sysvar = next_account_info(accounts_iter)?;
    if *instructions_sysvar.key != INSTRUCTIONS_ID { return Err(ProgramError::InvalidArgument); }
    if !verify_owner(instructions_sysvar, &params.owner_pubkey, &params.challenge_nonce)? {
        return Err(Error::SignatureVerificationFailed.into());
    }
    let (expected_registry, _) = crate::tin_v1_pda(program_id, &params.lookup_commitment);
    assert_pda(registry, &expected_registry)?;
    assert_program_owned(registry, program_id)?;
    let account: TinV1Account = load_borsh_with_zero_padding(registry)?;
    if account.version != TinV1Account::VERSION || account.status != TinV1Account::STATUS_ACTIVE
        || account.lookup_commitment != params.lookup_commitment
        || account.owner_commitment != hash(params.owner_pubkey.as_ref()).to_bytes() {
        return Err(Error::InvalidPda.into());
    }
    set_return_data(&account.encrypted_identity_envelope);
    Ok(())
}

fn verify_owner(sysvar: &AccountInfo, owner: &Pubkey, challenge: &[u8; 32]) -> Result<bool, ProgramError> {
    let current_index = load_current_index_checked(sysvar)? as usize;
    for index in 0..current_index {
        if let Ok(ix) = load_instruction_at_checked(index, sysvar) {
            if ix.program_id != solana_program::ed25519_program::ID || ix.data.len() < 112 || ix.data[0] != 1 { continue; }
            let pubkey_offset = u16::from_le_bytes([ix.data[6], ix.data[7]]) as usize;
            let message_offset = u16::from_le_bytes([ix.data[10], ix.data[11]]) as usize;
            let message_size = u16::from_le_bytes([ix.data[12], ix.data[13]]) as usize;
            if pubkey_offset + 32 <= ix.data.len() && message_offset + message_size <= ix.data.len()
                && &ix.data[pubkey_offset..pubkey_offset + 32] == owner.as_ref()
                && &ix.data[message_offset..message_offset + message_size] == challenge {
                return Ok(true);
            }
        }
    }
    Ok(false)
}
