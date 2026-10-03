use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program,
    sysvar::{instructions::ID as INSTRUCTIONS_ID, Sysvar},
};

use crate::{
    cpi::create_pda_account,
    error::Error,
    instruction_auto::{
        CreateTinV1Params, FinalizeTinV1CreationParams, StageTinV1CreationParams,
        TinV1CreationChunkParams,
    },
    processor::create_tin_v1,
    state::{validate_tcap_route, TinV1CreationStaging},
    utils::{assert_pda, assert_program_owned, load_borsh, store_borsh},
};

pub fn stage(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: StageTinV1CreationParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let payer = next_account_info(accounts_iter)?;
    let staging = next_account_info(accounts_iter)?;
    let system = next_account_info(accounts_iter)?;
    if !payer.is_signer || *system.key != system_program::ID {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let identity_len = params.encrypted_identity_envelope_len as usize;
    let recovery_len = params.encrypted_tin_recovery_len as usize;
    let seed_len = params.encrypted_master_seed_len as usize;
    let route_len = params.encrypted_public_route_envelope_len as usize;
    if params.lookup_commitment == [0; 32]
        || params.intent_hash == [0; 32]
        || params.route_version == 0
        || params.expiry_ts < Clock::get()?.unix_timestamp
        || identity_len == 0
        || recovery_len < 28
        || seed_len == 0
        || identity_len > TinV1CreationStaging::MAX_BLOB_LEN
        || seed_len > TinV1CreationStaging::MAX_BLOB_LEN
        || route_len > TinV1CreationStaging::MAX_BLOB_LEN
        || identity_len + recovery_len + seed_len + route_len > TinV1CreationStaging::MAX_BLOB_LEN
        || !validate_tcap_route(
            params.tcap_route_version,
            &params.pru_configuration_hash,
            &[],
            &params.tcap_relationship_commitment,
            &params.tcap_relationship_reference,
            &params.tcap_policy_commitment,
        )
    {
        return Err(Error::InvalidInstruction.into());
    }

    let (expected_staging, bump) = crate::tin_v1_creation_staging_pda(
        program_id,
        &params.owner_pubkey,
        &params.intent_hash,
    );
    assert_pda(staging, &expected_staging)?;
    if !staging.data_is_empty() {
        assert_program_owned(staging, program_id)?;
        let existing: TinV1CreationStaging = load_borsh(staging)?;
        if existing.version != TinV1CreationStaging::VERSION
            || existing.bump != bump
            || existing.owner_pubkey != params.owner_pubkey
            || existing.lookup_commitment != params.lookup_commitment
            || existing.intent_hash != params.intent_hash
            || existing.encrypted_identity_envelope.len() != identity_len
            || existing.encrypted_tin_recovery.len() != recovery_len
            || existing.encrypted_master_seed.len() != seed_len
            || existing.encrypted_public_route_envelope.len() != route_len
            || existing.encrypted_metadata_hash != params.encrypted_metadata_hash
            || existing.pru_configuration_hash != params.pru_configuration_hash
            || existing.route_version != params.route_version
            || existing.route_nonce != params.route_nonce
            || existing.tcap_route_version != params.tcap_route_version
            || existing.tcap_relationship_commitment != params.tcap_relationship_commitment
            || existing.tcap_relationship_reference != params.tcap_relationship_reference
            || existing.tcap_policy_commitment != params.tcap_policy_commitment
            || existing.expiry_ts != params.expiry_ts
        {
            return Err(Error::InvalidInstruction.into());
        }
        return Ok(());
    }

    let state = TinV1CreationStaging {
        version: TinV1CreationStaging::VERSION,
        bump,
        owner_pubkey: params.owner_pubkey,
        lookup_commitment: params.lookup_commitment,
        intent_hash: params.intent_hash,
        encrypted_identity_envelope: vec![0; identity_len],
        identity_written: 0,
        encrypted_tin_recovery: vec![0; recovery_len],
        recovery_written: 0,
        encrypted_master_seed: vec![0; seed_len],
        master_seed_written: 0,
        encrypted_metadata_hash: params.encrypted_metadata_hash,
        pru_configuration_hash: params.pru_configuration_hash,
        encrypted_public_route_envelope: vec![0; route_len],
        route_written: 0,
        route_version: params.route_version,
        route_nonce: params.route_nonce,
        tcap_route_version: params.tcap_route_version,
        tcap_relationship_commitment: params.tcap_relationship_commitment,
        tcap_relationship_reference: params.tcap_relationship_reference,
        tcap_policy_commitment: params.tcap_policy_commitment,
        expiry_ts: params.expiry_ts,
    };
    create_pda_account(
        payer,
        staging,
        system,
        program_id,
        TinV1CreationStaging::space(identity_len, recovery_len, seed_len, route_len),
        0,
        &[
            crate::seeds::TIN_V1_CREATE_STAGE,
            params.owner_pubkey.as_ref(),
            &params.intent_hash,
            &[bump],
        ],
    )?;
    store_borsh(staging, &state)
}

pub fn append_chunk(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: TinV1CreationChunkParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let cranker = next_account_info(accounts_iter)?;
    let staging = next_account_info(accounts_iter)?;
    if !cranker.is_signer || params.bytes.is_empty() || params.bytes.len() > 700 {
        return Err(ProgramError::InvalidArgument);
    }
    assert_program_owned(staging, program_id)?;
    let mut state: TinV1CreationStaging = load_borsh(staging)?;
    if state.version != TinV1CreationStaging::VERSION
        || state.expiry_ts < Clock::get()?.unix_timestamp
    {
        return Err(Error::InvalidInstruction.into());
    }
    let (expected_staging, _) = crate::tin_v1_creation_staging_pda(
        program_id,
        &state.owner_pubkey,
        &state.intent_hash,
    );
    if staging.key != &expected_staging {
        return Err(Error::InvalidPda.into());
    }
    let (target, written) = match params.kind {
        0 => (&mut state.encrypted_identity_envelope, &mut state.identity_written),
        1 => (&mut state.encrypted_master_seed, &mut state.master_seed_written),
        2 => (&mut state.encrypted_public_route_envelope, &mut state.route_written),
        3 => (&mut state.encrypted_tin_recovery, &mut state.recovery_written),
        _ => return Err(ProgramError::InvalidArgument),
    };
    let offset = params.offset as usize;
    let end = offset
        .checked_add(params.bytes.len())
        .ok_or(Error::Overflow)?;
    if end > target.len() || offset > *written as usize {
        return Err(Error::InvalidInstruction.into());
    }
    if offset < *written as usize {
        if end > *written as usize || target[offset..end] != params.bytes[..] {
            return Err(Error::InvalidInstruction.into());
        }
        return Ok(());
    }
    target[offset..end].copy_from_slice(&params.bytes);
    *written = end as u32;
    store_borsh(staging, &state)
}

pub fn finalize(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: FinalizeTinV1CreationParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let payer = next_account_info(accounts_iter)?;
    let global_state = next_account_info(accounts_iter)?;
    let registry = next_account_info(accounts_iter)?;
    let owner_recovery = next_account_info(accounts_iter)?;
    let instructions = next_account_info(accounts_iter)?;
    let system = next_account_info(accounts_iter)?;
    let staging = next_account_info(accounts_iter)?;
    if !payer.is_signer || *instructions.key != INSTRUCTIONS_ID || *system.key != system_program::ID {
        return Err(ProgramError::MissingRequiredSignature);
    }
    assert_program_owned(staging, program_id)?;
    let state: TinV1CreationStaging = load_borsh(staging)?;
    if state.version != TinV1CreationStaging::VERSION
        || state.intent_hash != params.intent_hash
        || state.expiry_ts < Clock::get()?.unix_timestamp
        || state.identity_written as usize != state.encrypted_identity_envelope.len()
        || state.recovery_written as usize != state.encrypted_tin_recovery.len()
        || state.master_seed_written as usize != state.encrypted_master_seed.len()
        || state.route_written as usize != state.encrypted_public_route_envelope.len()
    {
        return Err(Error::InvalidInstruction.into());
    }
    let (expected_staging, _) = crate::tin_v1_creation_staging_pda(
        program_id,
        &state.owner_pubkey,
        &state.intent_hash,
    );
    if staging.key != &expected_staging {
        return Err(Error::InvalidPda.into());
    }
    let creation = CreateTinV1Params {
        owner_pubkey: state.owner_pubkey,
        lookup_commitment: state.lookup_commitment,
        encrypted_tin_recovery: state.encrypted_tin_recovery,
        encrypted_identity_envelope: state.encrypted_identity_envelope,
        encrypted_master_seed: state.encrypted_master_seed,
        encrypted_metadata_hash: state.encrypted_metadata_hash,
        pru_configuration_hash: state.pru_configuration_hash,
        encrypted_public_route_envelope: state.encrypted_public_route_envelope,
        route_version: state.route_version,
        route_nonce: state.route_nonce,
        tcap_route_version: state.tcap_route_version,
        tcap_relationship_commitment: state.tcap_relationship_commitment,
        tcap_relationship_reference: state.tcap_relationship_reference,
        tcap_policy_commitment: state.tcap_policy_commitment,
        intent_hash: state.intent_hash,
        expiry_ts: state.expiry_ts,
    };
    create_tin_v1::apply(
        program_id,
        payer,
        global_state,
        registry,
        owner_recovery,
        instructions,
        system,
        creation,
    )?;
    close_account(staging, payer)
}

pub fn close_expired(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: FinalizeTinV1CreationParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let cranker = next_account_info(accounts_iter)?;
    let staging = next_account_info(accounts_iter)?;
    if !cranker.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    assert_program_owned(staging, program_id)?;
    let state: TinV1CreationStaging = load_borsh(staging)?;
    if state.intent_hash != params.intent_hash || state.expiry_ts >= Clock::get()?.unix_timestamp {
        return Err(Error::InvalidInstruction.into());
    }
    let (expected_staging, _) = crate::tin_v1_creation_staging_pda(
        program_id,
        &state.owner_pubkey,
        &state.intent_hash,
    );
    if staging.key != &expected_staging {
        return Err(Error::InvalidPda.into());
    }
    close_account(staging, cranker)
}

fn close_account(account: &AccountInfo, recipient: &AccountInfo) -> ProgramResult {
    let account_lamports = **account.lamports.borrow();
    let recipient_lamports = **recipient.lamports.borrow();
    **recipient.lamports.borrow_mut() = recipient_lamports
        .checked_add(account_lamports)
        .ok_or(Error::Overflow)?;
    **account.lamports.borrow_mut() = 0;
    account.realloc(0, false)
}

