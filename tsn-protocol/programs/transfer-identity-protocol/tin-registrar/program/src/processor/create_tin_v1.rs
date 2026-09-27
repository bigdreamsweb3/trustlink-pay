use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    hash::{hash, hashv},
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::{instructions::{load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID}, Sysvar},
};

use crate::{
    cpi::create_pda_account,
    error::Error,
    instruction_auto::CreateTinV1Params,
    state::{validate_tcap_route, GlobalState, TinV1Account},
    utils::{assert_pda, assert_program_owned, load_borsh, store_borsh},
};

pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], params: CreateTinV1Params) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let payer = next_account_info(accounts_iter)?;
    let global_state = next_account_info(accounts_iter)?;
    let registry = next_account_info(accounts_iter)?;
    let instructions_sysvar = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    if !payer.is_signer || *instructions_sysvar.key != INSTRUCTIONS_ID {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if params.lookup_commitment == [0; 32]
        || params.encrypted_identity_envelope.is_empty()
        || params.encrypted_master_seed.is_empty()
        || params.route_version == 0
        || params.expiry_ts < Clock::get()?.unix_timestamp
    {
        return Err(Error::InvalidInstruction.into());
    }
    if !validate_tcap_route(
        params.tcap_route_version,
        &params.pru_configuration_hash,
        &params.encrypted_public_route_envelope,
        &params.tcap_relationship_commitment,
        &params.tcap_relationship_reference,
        &params.tcap_policy_commitment,
    ) {
        return Err(Error::InvalidInstruction.into());
    }

    assert_program_owned(global_state, program_id)?;
    if !registry.data_is_empty() {
        return Err(Error::RegistryAlreadyInitialized.into());
    }
    let expected = owner_intent_hash(&params);
    if params.intent_hash != expected {
        return Err(Error::InvalidInstruction.into());
    }
    if !verify_owner_intent(instructions_sysvar, &params.owner_pubkey, &expected)? {
        return Err(Error::SignatureVerificationFailed.into());
    }
    let (expected_registry, bump) = crate::tin_v1_pda(program_id, &params.lookup_commitment);
    assert_pda(registry, &expected_registry)?;

    let mut global: GlobalState = load_borsh(global_state)?;
    global.next_sequence = global.next_sequence.checked_add(1).ok_or(Error::Overflow)?;
    let account = TinV1Account {
        version: TinV1Account::VERSION,
        bump,
        status: TinV1Account::STATUS_ACTIVE,
        reserved: [0; 5],
        lookup_commitment: params.lookup_commitment,
        owner_commitment: hash(params.owner_pubkey.as_ref()).to_bytes(),
        encrypted_identity_envelope: params.encrypted_identity_envelope,
        encrypted_master_seed: params.encrypted_master_seed,
        created_at: Clock::get()?.unix_timestamp,
        encrypted_metadata_hash: params.encrypted_metadata_hash,
        pru_configuration_hash: params.pru_configuration_hash,
        encrypted_public_route_envelope: params.encrypted_public_route_envelope,
        route_version: params.route_version,
        route_nonce: params.route_nonce,
        tcap_route_version: params.tcap_route_version,
        tcap_relationship_commitment: params.tcap_relationship_commitment,
        tcap_relationship_reference: params.tcap_relationship_reference,
        tcap_policy_commitment: params.tcap_policy_commitment,
    };
    let seeds: [&[u8]; 3] = [crate::seeds::TIN_V1, &params.lookup_commitment, &[bump]];
    create_pda_account(
        payer,
        registry,
        system_program,
        program_id,
        TinV1Account::space(
            account.encrypted_identity_envelope.len(),
            account.encrypted_master_seed.len(),
            account.encrypted_public_route_envelope.len(),
        ),
        0,
        &seeds,
    )?;
    store_borsh(registry, &account)?;
    store_borsh(global_state, &global)
}

fn owner_intent_hash(params: &CreateTinV1Params) -> [u8; 32] {
    let identity_len = (params.encrypted_identity_envelope.len() as u32).to_le_bytes();
    let seed_len = (params.encrypted_master_seed.len() as u32).to_le_bytes();
    let route_len = (params.encrypted_public_route_envelope.len() as u32).to_le_bytes();
    hashv(&[
        b"TSN_TIN_V1_CREATE",
        params.owner_pubkey.as_ref(),
        &params.lookup_commitment,
        &identity_len,
        &params.encrypted_identity_envelope,
        &seed_len,
        &params.encrypted_master_seed,
        &params.encrypted_metadata_hash,
        &params.pru_configuration_hash,
        &route_len,
        &params.encrypted_public_route_envelope,
        &params.route_version.to_le_bytes(),
        &params.route_nonce,
        &[params.tcap_route_version],
        &params.tcap_relationship_commitment,
        &params.tcap_relationship_reference,
        &params.tcap_policy_commitment,
        &params.expiry_ts.to_le_bytes(),
    ]).to_bytes()
}

fn verify_owner_intent(
    instructions_sysvar: &AccountInfo,
    owner: &Pubkey,
    expected: &[u8; 32],
) -> Result<bool, ProgramError> {
    let current_index = load_current_index_checked(instructions_sysvar)? as usize;
    for index in 0..current_index {
        if let Ok(ix) = load_instruction_at_checked(index, instructions_sysvar) {
            if ix.program_id == solana_program::ed25519_program::ID && verify_ed25519(&ix.data, owner, expected) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn verify_ed25519(data: &[u8], owner: &Pubkey, message: &[u8; 32]) -> bool {
    if data.len() < 112 || data[0] != 1 { return false; }
    let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let message_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_size = u16::from_le_bytes([data[12], data[13]]) as usize;
    if !pubkey_offset.checked_add(32).map_or(false, |end| end <= data.len()) {
        return false;
    }
    if !message_offset.checked_add(message_size).map_or(false, |end| end <= data.len()) {
        return false;
    }
    &data[pubkey_offset..pubkey_offset + 32] == owner.as_ref()
        && &data[message_offset..message_offset + message_size] == message
}
