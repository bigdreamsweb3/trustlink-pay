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
    state::{validate_tip_route, GlobalState, TinV1Account, TinV1OwnerRecoveryAccount},
    utils::{assert_pda, assert_program_owned, load_borsh, store_borsh},
};

pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], params: CreateTinV1Params) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let payer = next_account_info(accounts_iter)?;
    let global_state = next_account_info(accounts_iter)?;
    let registry = next_account_info(accounts_iter)?;
    let owner_recovery = next_account_info(accounts_iter)?;
    let instructions_sysvar = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    if !payer.is_signer || *instructions_sysvar.key != INSTRUCTIONS_ID {
        return Err(ProgramError::MissingRequiredSignature);
    }
    apply(program_id, payer, global_state, registry, owner_recovery, instructions_sysvar, system_program, params)
}

pub fn apply<'a>(
    program_id: &Pubkey,
    payer: &AccountInfo<'a>,
    global_state: &AccountInfo<'a>,
    registry: &AccountInfo<'a>,
    owner_recovery: &AccountInfo<'a>,
    instructions_sysvar: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    params: CreateTinV1Params,
) -> ProgramResult {
    if !payer.is_signer || *instructions_sysvar.key != INSTRUCTIONS_ID {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if params.lookup_commitment == [0; 32]
        || params.encrypted_identity_envelope.is_empty()
        || params.encrypted_tin_recovery.len() < 28
        || params.encrypted_master_seed.is_empty()
        || params.route_version == 0
        || params.expiry_ts < Clock::get()?.unix_timestamp
    {
        return Err(Error::InvalidInstruction.into());
    }
    if !validate_tip_route(
        params.tip_route_version,
        &params.gpru_public_commitment,
        &params.tip_root_commitment,
        &params.policy_commitment,
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
    let (expected_recovery, recovery_bump) = crate::tin_v1_owner_recovery_pda(program_id, &params.owner_pubkey);
    assert_pda(owner_recovery, &expected_recovery)?;
    if !owner_recovery.data_is_empty() {
        return Err(Error::RegistryAlreadyInitialized.into());
    }

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
        route_version: params.route_version,
        route_nonce: params.route_nonce,
        tip_route_version: params.tip_route_version,
        gpru_public_commitment: params.gpru_public_commitment,
        tip_root_commitment: params.tip_root_commitment,
        policy_commitment: params.policy_commitment,
    };
    let seeds: [&[u8]; 3] = [crate::seeds::TIN_V1, &params.lookup_commitment, &[bump]];
    create_pda_account(
        payer,
        registry,
        system_program,
        program_id,
        TinV1Account::space(account.encrypted_identity_envelope.len(), account.encrypted_master_seed.len()),
        0,
        &seeds,
    )?;
    store_borsh(registry, &account)?;
    let recovery = TinV1OwnerRecoveryAccount {
        version: TinV1OwnerRecoveryAccount::VERSION,
        bump: recovery_bump,
        owner_pubkey: params.owner_pubkey,
        encrypted_tin: params.encrypted_tin_recovery,
    };
    let recovery_seeds: [&[u8]; 3] = [crate::seeds::TIN_V1_OWNER_RECOVERY, params.owner_pubkey.as_ref(), &[recovery_bump]];
    create_pda_account(
        payer,
        owner_recovery,
        system_program,
        program_id,
        TinV1OwnerRecoveryAccount::space(recovery.encrypted_tin.len()),
        0,
        &recovery_seeds,
    )?;
    store_borsh(owner_recovery, &recovery)?;
    store_borsh(global_state, &global)
}

fn owner_intent_hash(params: &CreateTinV1Params) -> [u8; 32] {
    let identity_len = (params.encrypted_identity_envelope.len() as u32).to_le_bytes();
    let seed_len = (params.encrypted_master_seed.len() as u32).to_le_bytes();
    hashv(&[
        b"TSN_TIN_V1_CREATE",
        params.owner_pubkey.as_ref(),
        &params.lookup_commitment,
        &(params.encrypted_tin_recovery.len() as u32).to_le_bytes(),
        &params.encrypted_tin_recovery,
        &identity_len,
        &params.encrypted_identity_envelope,
        &seed_len,
        &params.encrypted_master_seed,
        &params.encrypted_metadata_hash,
        &params.route_version.to_le_bytes(),
        &params.route_nonce,
        &[params.tip_route_version],
        &params.gpru_public_commitment,
        &params.tip_root_commitment,
        &params.policy_commitment,
        &params.expiry_ts.to_le_bytes(),
    ]).to_bytes()
}

fn verify_owner_intent(
    instructions_sysvar: &AccountInfo,
    owner: &Pubkey,
    expected: &[u8; 32],
) -> Result<bool, ProgramError> {
    let current_index = load_current_index_checked(instructions_sysvar)? as usize;
    let readable_message = canonical_owner_intent_message(expected);
    for index in 0..current_index {
        if let Ok(ix) = load_instruction_at_checked(index, instructions_sysvar) {
            if ix.program_id == solana_program::ed25519_program::ID
                && verify_ed25519(&ix.data, owner, &readable_message)
            {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn canonical_owner_intent_message(intent_hash: &[u8; 32]) -> Vec<u8> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut message = Vec::with_capacity(256);
    message.extend_from_slice(
        b"TrustLink TIN creation approval\n\nYou are approving the encrypted creation request for your TIN.\n\nREQUEST DETAILS\nIntent reference: ",
    );
    for byte in intent_hash {
        message.push(HEX[(byte >> 4) as usize]);
        message.push(HEX[(byte & 0x0f) as usize]);
    }
    message.extend_from_slice(
        b"\n\nProtocol: Transfer Identity Protocol (TIP)\n\nVersion: 1\n\nNEXT STEP\nTSN will verify this approval before submission to Solana.\n\nNo funds are transferred by this approval.",
    );
    message
}

fn verify_ed25519(data: &[u8], owner: &Pubkey, message: &[u8]) -> bool {
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
