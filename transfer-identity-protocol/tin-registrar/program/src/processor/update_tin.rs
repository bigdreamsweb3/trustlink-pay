use std::convert::TryInto;

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    hash::{hash, hashv},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program,
    sysvar::{
        instructions::{
            load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID,
        },
        Sysvar,
    },
};

use crate::{
    error::Error,
    instruction_auto::{FinalizeTinUpdateParams, UpdateTinParams},
    state::{validate_tcap_route, TinAccount, TinMutationStaging, TCAP_ROUTE_VERSION_NONE},
    utils::{assert_program_owned, load_borsh, store_borsh, top_up_and_realloc, validate_name},
};

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: UpdateTinParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let cranker = next_account_info(accounts_iter)?;
    let identity = next_account_info(accounts_iter)?;
    let instructions_sysvar = next_account_info(accounts_iter)?;
    let system_program_account = accounts_iter.next();

    if !cranker.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if *instructions_sysvar.key != INSTRUCTIONS_ID {
        return Err(ProgramError::InvalidArgument);
    }
    apply_update(
        program_id,
        cranker,
        identity,
        instructions_sysvar,
        system_program_account,
        params,
    )
}

/// Finalize a staged mutation after the encrypted blobs have been uploaded in
/// bounded chunks. The owner signature remains in the immediately preceding
/// Ed25519 instruction, exactly as it is for the single-packet path.
pub fn process_staged(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: FinalizeTinUpdateParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let cranker = next_account_info(accounts_iter)?;
    let identity = next_account_info(accounts_iter)?;
    let staging = next_account_info(accounts_iter)?;
    let instructions_sysvar = next_account_info(accounts_iter)?;
    let system_program_account = next_account_info(accounts_iter)?;

    if !cranker.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if *instructions_sysvar.key != INSTRUCTIONS_ID {
        return Err(ProgramError::InvalidArgument);
    }
    assert_program_owned(staging, program_id)?;
    let staged: TinMutationStaging = load_borsh(staging)?;
    if staged.version != TinMutationStaging::VERSION
        || staged.intent_hash != params.intent_hash
        || staged.master_seed_written as usize != staged.encrypted_master_seed.len()
        || staged.route_written as usize != staged.encrypted_public_route_envelope.len()
    {
        return Err(Error::InvalidInstruction.into());
    }
    let (expected_staging, _bump) =
        crate::tin_mutation_staging_pda(program_id, &staged.owner_pubkey, &staged.intent_hash);
    if staging.key != &expected_staging {
        return Err(Error::InvalidPda.into());
    }

    let update = UpdateTinParams {
        owner_pubkey: staged.owner_pubkey,
        display_name: staged.display_name.clone(),
        encrypted_master_seed: staged.encrypted_master_seed.clone(),
        encrypted_metadata_hash: staged.encrypted_metadata_hash,
        pru_configuration_hash: staged.pru_configuration_hash,
        encrypted_public_route_envelope: staged.encrypted_public_route_envelope.clone(),
        route_version: staged.route_version,
        route_nonce: staged.route_nonce,
        tcap_route_version: staged.tcap_route_version,
        tcap_relationship_commitment: staged.tcap_relationship_commitment,
        tcap_relationship_reference: staged.tcap_relationship_reference,
        tcap_policy_commitment: staged.tcap_policy_commitment,
        nonce: staged.nonce,
        intent_hash: staged.intent_hash,
        expiry_ts: staged.expiry_ts,
    };
    apply_update(
        program_id,
        cranker,
        identity,
        instructions_sysvar,
        Some(system_program_account),
        update,
    )?;

    // The committed TinAccount now owns the copied bytes. Reclaim the
    // temporary staging rent to the submitting Cranker and close the PDA.
    let lamports = **staging.lamports.borrow();
    let cranker_lamports = **cranker.lamports.borrow();
    **cranker.lamports.borrow_mut() = cranker_lamports
        .checked_add(lamports)
        .ok_or(Error::Overflow)?;
    **staging.lamports.borrow_mut() = 0;
    staging.realloc(0, false)
}

fn apply_update<'a>(
    program_id: &Pubkey,
    cranker: &AccountInfo<'a>,
    identity: &AccountInfo<'a>,
    instructions_sysvar: &AccountInfo<'a>,
    system_program_account: Option<&AccountInfo<'a>>,
    params: UpdateTinParams,
) -> ProgramResult {
    if !cranker.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if Clock::get()?.unix_timestamp > params.expiry_ts {
        return Err(Error::InvalidInstruction.into());
    }
    validate_name(&params.display_name)?;
    if !valid_route(&params) {
        return Err(Error::InvalidInstruction.into());
    }
    let expected_intent_hash = compute_owner_intent_hash(&params);
    if expected_intent_hash != params.intent_hash {
        return Err(Error::InvalidInstruction.into());
    }

    let mut hasher_input = Vec::new();
    hasher_input.extend_from_slice(params.owner_pubkey.as_ref());
    hasher_input.extend_from_slice(crate::PROGRAM_SALT);
    let identity_seed = hash(&hasher_input).to_bytes();
    let (expected_identity_pubkey, _bump) = crate::identity_pda(program_id, &identity_seed);
    assert_program_owned(identity, program_id)?;

    if !verify_owner_intent(
        instructions_sysvar,
        &params.owner_pubkey,
        &params.intent_hash,
    )? {
        return Err(Error::SignatureVerificationFailed.into());
    }
    let owner_pubkey_hash = hash(params.owner_pubkey.as_ref()).to_bytes();

    let existing_account = load_tin_account_for_update(identity)?;
    if params.route_version <= existing_account.route_version {
        return Err(Error::InvalidInstruction.into());
    }
    if identity.key != &expected_identity_pubkey {
        return Err(Error::InvalidPda.into());
    }
    if existing_account.owner_pubkey_hash != owner_pubkey_hash
        && existing_account.owner_pubkey_hash != params.owner_pubkey.to_bytes()
        && existing_account.owner_pubkey_hash != identity.key.to_bytes()
    {
        return Err(Error::InvalidPda.into());
    }

    let tin_account = TinAccount {
        tin: existing_account.tin,
        display_name: params.display_name,
        owner_pubkey_hash,
        encrypted_master_seed: params.encrypted_master_seed,
        created_at: existing_account.created_at,
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

    let required_space = TinAccount::space(
        &tin_account.display_name,
        tin_account.encrypted_master_seed.len(),
        tin_account.encrypted_public_route_envelope.len(),
    );
    if identity.data_len() != required_space {
        let Some(system_program_account) = system_program_account else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };
        if *system_program_account.key != system_program::ID {
            return Err(ProgramError::InvalidArgument);
        }
        top_up_and_realloc(cranker, identity, system_program_account, required_space)?;
    }

    store_borsh(identity, &tin_account)
}

fn compute_owner_intent_hash(params: &UpdateTinParams) -> [u8; 32] {
    hashv(&[
        b"TINS_UPDATE_INTENT_V1",
        params.owner_pubkey.as_ref(),
        params.display_name.as_bytes(),
        &params.encrypted_master_seed,
        &params.encrypted_metadata_hash,
        &params.pru_configuration_hash,
        &params.encrypted_public_route_envelope,
        &params.route_version.to_le_bytes(),
        &params.route_nonce,
        &[params.tcap_route_version],
        &params.tcap_relationship_commitment,
        &params.tcap_relationship_reference,
        &params.tcap_policy_commitment,
        &params.nonce,
        &params.expiry_ts.to_le_bytes(),
    ])
    .to_bytes()
}

struct ExistingTinAccount {
    tin: u64,
    owner_pubkey_hash: [u8; 32],
    created_at: i64,
    route_version: u64,
}

fn load_tin_account_for_update(identity: &AccountInfo) -> Result<ExistingTinAccount, ProgramError> {
    if let Ok(account) = load_borsh::<TinAccount>(identity) {
        return Ok(ExistingTinAccount {
            tin: account.tin,
            owner_pubkey_hash: account.owner_pubkey_hash,
            created_at: account.created_at,
            route_version: account.route_version,
        });
    }
    load_legacy_tin_account(identity)
}

fn load_legacy_tin_account(identity: &AccountInfo) -> Result<ExistingTinAccount, ProgramError> {
    let data = identity.data.borrow();
    let mut offset = 0usize;
    if data.len() < 8 + 4 {
        return Err(ProgramError::InvalidAccountData);
    }
    let tin = read_u64(&data, &mut offset)?;
    let display_name_len = read_u32(&data, &mut offset)? as usize;
    offset = offset
        .checked_add(display_name_len)
        .ok_or(Error::Overflow)?;
    if offset + 32 > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    let owner_pubkey_hash = data[offset..offset + 32]
        .try_into()
        .map_err(|_| ProgramError::InvalidAccountData)?;
    offset += 32;
    let encrypted_master_seed_len = read_u32(&data, &mut offset)? as usize;
    offset = offset
        .checked_add(encrypted_master_seed_len)
        .ok_or(Error::Overflow)?;
    if offset + 8 > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    let created_at = i64::from_le_bytes(
        data[offset..offset + 8]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    Ok(ExistingTinAccount {
        tin,
        owner_pubkey_hash,
        created_at,
        route_version: 0,
    })
}

fn read_u32(data: &[u8], offset: &mut usize) -> Result<u32, ProgramError> {
    if *offset + 4 > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    let value = u32::from_le_bytes(
        data[*offset..*offset + 4]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    *offset += 4;
    Ok(value)
}

fn read_u64(data: &[u8], offset: &mut usize) -> Result<u64, ProgramError> {
    if *offset + 8 > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    let value = u64::from_le_bytes(
        data[*offset..*offset + 8]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    *offset += 8;
    Ok(value)
}

fn verify_owner_intent(
    instructions_sysvar: &AccountInfo,
    owner: &Pubkey,
    intent_hash: &[u8; 32],
) -> Result<bool, ProgramError> {
    let current_index = load_current_index_checked(instructions_sysvar)? as usize;
    for i in 0..current_index {
        if let Ok(ix) = load_instruction_at_checked(i, instructions_sysvar) {
            if ix.program_id == solana_program::ed25519_program::ID
                && verify_ed25519_ix_data(&ix.data, owner, intent_hash)
            {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn verify_ed25519_ix_data(
    data: &[u8],
    expected_pubkey: &Pubkey,
    expected_message: &[u8; 32],
) -> bool {
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
        || parsed_message == canonical_owner_intent_message(expected_message).as_slice()
        || hash(parsed_message).to_bytes() == *expected_message
}

fn canonical_owner_intent_message(intent_hash: &[u8; 32]) -> Vec<u8> {
    let mut message = b"TSN TIN Upgrade\n---\nIntent Hash: ".to_vec();
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for byte in intent_hash {
        message.push(HEX[(byte >> 4) as usize]);
        message.push(HEX[(byte & 0x0f) as usize]);
    }
    message.extend_from_slice(b"\nDomain: TSN_TIN_OWNER_INTENT_V1");
    message
}

fn valid_route(params: &UpdateTinParams) -> bool {
    if params.tcap_route_version == TCAP_ROUTE_VERSION_NONE
        && (params.route_version == 0 || params.encrypted_public_route_envelope.is_empty())
    {
        return false;
    }
    validate_tcap_route(
        params.tcap_route_version,
        &params.pru_configuration_hash,
        &params.encrypted_public_route_envelope,
        &params.tcap_relationship_commitment,
        &params.tcap_relationship_reference,
        &params.tcap_policy_commitment,
    )
}
