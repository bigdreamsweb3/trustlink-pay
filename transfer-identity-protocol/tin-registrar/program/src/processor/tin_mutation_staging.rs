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
    instruction_auto::{StageTinMutationParams, TinMutationChunkParams},
    state::{validate_tcap_route, TinMutationStaging, TCAP_ROUTE_VERSION_NONE},
    tin_mutation_staging_pda,
    utils::{
        assert_pda, assert_program_owned, load_borsh, store_borsh, top_up_and_realloc,
        validate_name,
    },
};

pub fn stage(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: StageTinMutationParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let cranker = next_account_info(accounts_iter)?;
    let staging = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    if !cranker.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    validate_name(&params.display_name)?;
    if params.expiry_ts <= Clock::get()?.unix_timestamp || !valid_route(&params) {
        return Err(Error::InvalidInstruction.into());
    }
    let master_len = params.encrypted_master_seed_len as usize;
    let route_len = params.encrypted_public_route_envelope_len as usize;
    if master_len == 0
        || (params.tcap_route_version == TCAP_ROUTE_VERSION_NONE && route_len == 0)
        || master_len > TinMutationStaging::MAX_BLOB_LEN
        || route_len > TinMutationStaging::MAX_BLOB_LEN
    {
        return Err(Error::InvalidInstruction.into());
    }

    let (expected_staging, bump) =
        tin_mutation_staging_pda(program_id, &params.owner_pubkey, &params.intent_hash);
    assert_pda(staging, &expected_staging)?;

    if !staging.data_is_empty() {
        assert_program_owned(staging, program_id)?;
        let existing: TinMutationStaging = load_borsh(staging)?;
        if existing.version != TinMutationStaging::VERSION
            || existing.owner_pubkey != params.owner_pubkey
            || existing.intent_hash != params.intent_hash
            || existing.display_name != params.display_name
            || existing.encrypted_metadata_hash != params.encrypted_metadata_hash
            || existing.pru_configuration_hash != params.pru_configuration_hash
            || existing.route_version != params.route_version
            || existing.route_nonce != params.route_nonce
            || existing.tcap_route_version != params.tcap_route_version
            || existing.tcap_relationship_commitment != params.tcap_relationship_commitment
            || existing.tcap_relationship_reference != params.tcap_relationship_reference
            || existing.tcap_policy_commitment != params.tcap_policy_commitment
            || existing.nonce != params.nonce
            || existing.expiry_ts != params.expiry_ts
            || existing.encrypted_master_seed.len() != master_len
            || existing.encrypted_public_route_envelope.len() != route_len
        {
            return Err(Error::InvalidInstruction.into());
        }
        return Ok(());
    }

    let state = TinMutationStaging {
        version: TinMutationStaging::VERSION,
        bump,
        owner_pubkey: params.owner_pubkey,
        intent_hash: params.intent_hash,
        display_name: params.display_name,
        encrypted_metadata_hash: params.encrypted_metadata_hash,
        pru_configuration_hash: params.pru_configuration_hash,
        route_version: params.route_version,
        route_nonce: params.route_nonce,
        tcap_route_version: params.tcap_route_version,
        tcap_relationship_commitment: params.tcap_relationship_commitment,
        tcap_relationship_reference: params.tcap_relationship_reference,
        tcap_policy_commitment: params.tcap_policy_commitment,
        nonce: params.nonce,
        expiry_ts: params.expiry_ts,
        encrypted_master_seed: vec![0; master_len],
        master_seed_written: 0,
        encrypted_public_route_envelope: vec![0; route_len],
        route_written: 0,
    };
    create_pda_account(
        cranker,
        staging,
        system_program,
        program_id,
        TinMutationStaging::space(state.display_name.len(), master_len, route_len),
        0,
        &[
            crate::seeds::TIN_MUTATION_STAGE,
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
    params: TinMutationChunkParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let cranker = next_account_info(accounts_iter)?;
    let staging = next_account_info(accounts_iter)?;
    if !cranker.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    assert_program_owned(staging, program_id)?;
    let mut state: TinMutationStaging = load_borsh(staging)?;
    if params.bytes.is_empty() {
        return Err(Error::InvalidInstruction.into());
    }
    let (written, target_len) = match params.kind {
        0 => (state.master_seed_written, state.encrypted_master_seed.len()),
        1 => (
            state.route_written,
            state.encrypted_public_route_envelope.len(),
        ),
        _ => return Err(Error::InvalidInstruction.into()),
    };
    let offset = params.offset as usize;
    let end = offset
        .checked_add(params.bytes.len())
        .ok_or(Error::Overflow)?;
    if end > target_len || (offset != written as usize && offset >= written as usize) {
        return Err(Error::InvalidInstruction.into());
    }
    if offset < written as usize {
        let already = match params.kind {
            0 => &state.encrypted_master_seed[offset..end],
            1 => &state.encrypted_public_route_envelope[offset..end],
            _ => unreachable!(),
        };
        if already != params.bytes.as_slice() {
            return Err(Error::InvalidInstruction.into());
        }
        return Ok(());
    }

    match params.kind {
        0 => {
            state.encrypted_master_seed[offset..end].copy_from_slice(&params.bytes);
            state.master_seed_written = end as u32;
        }
        1 => {
            state.encrypted_public_route_envelope[offset..end].copy_from_slice(&params.bytes);
            state.route_written = end as u32;
        }
        _ => unreachable!(),
    }
    // The staging account is allocated at its final serialized size. Keep the
    // explicit reallocation/top-up here as a defensive invariant if the
    // account was created by an older compatible build.
    let required_space = TinMutationStaging::space(
        state.display_name.len(),
        state.encrypted_master_seed.len(),
        state.encrypted_public_route_envelope.len(),
    );
    if staging.data_len() != required_space {
        let system_program = next_account_info(accounts_iter)?;
        top_up_and_realloc(cranker, staging, system_program, required_space)?;
    }
    store_borsh(staging, &state)
}

fn valid_route(params: &StageTinMutationParams) -> bool {
    if params.tcap_route_version == TCAP_ROUTE_VERSION_NONE && params.route_version == 0 {
        return false;
    }
    // Staging contains zero-filled route bytes before chunk upload. TCap V1 has no route blob.
    validate_tcap_route(
        params.tcap_route_version,
        &params.pru_configuration_hash,
        &[],
        &params.tcap_relationship_commitment,
        &params.tcap_relationship_reference,
        &params.tcap_policy_commitment,
    )
}
