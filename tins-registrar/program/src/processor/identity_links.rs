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
    instruction_auto::{LinkSensitiveFieldParams, LinkSocialIdentityParams, LinkVerifiedSocialIdentityParams},
    state::{EncryptedSensitiveField, EncryptedSocialIdentity, IdentityRegistry, PlatformRegistry, PLATFORM_ACTIVE},
    utils::{
        assert_program_owned, load_borsh, store_borsh, top_up_and_realloc, validate_encrypted_blob,
        validate_identity_label, validate_identity_type, validate_metadata,
    },
};

fn assert_registry_owner(registry: &IdentityRegistry, owner: &AccountInfo) -> ProgramResult {
    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if registry.authority != *owner.key {
        return Err(Error::UnauthorizedClaimant.into());
    }
    Ok(())
}

fn validate_social_params(
    identity_type: &str,
    label: &str,
    nonce: &[u8],
    ciphertext: &[u8],
    metadata: &str,
) -> ProgramResult {
    validate_identity_type(identity_type)?;
    validate_identity_label(label)?;
    validate_encrypted_blob(nonce, ciphertext)?;
    validate_metadata(metadata)
}

pub fn link_social_identity(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: LinkSocialIdentityParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let owner = next_account_info(accounts_iter)?;
    let registry_account = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    assert_program_owned(registry_account, program_id)?;
    validate_social_params(
        &params.identity_type,
        &params.label,
        &params.nonce,
        &params.ciphertext,
        &params.metadata,
    )?;

    let mut registry: IdentityRegistry = load_borsh(registry_account)?;
    assert_registry_owner(&registry, owner)?;

    registry.social_identities.push(EncryptedSocialIdentity {
        identity_type: params.identity_type,
        label: params.label,
        nonce: params.nonce,
        ciphertext: params.ciphertext,
        metadata: params.metadata,
        verified_by: None,
        proof_hash: [0; 32],
        linked_at: Clock::get()?.unix_timestamp,
    });

    top_up_and_realloc(owner, registry_account, system_program, registry.dynamic_space())?;
    store_borsh(registry_account, &registry)
}

pub fn link_sensitive_field(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: LinkSensitiveFieldParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let owner = next_account_info(accounts_iter)?;
    let registry_account = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    assert_program_owned(registry_account, program_id)?;
    validate_identity_type(&params.field_type)?;
    validate_encrypted_blob(&params.nonce, &params.ciphertext)?;
    validate_metadata(&params.metadata)?;

    let mut registry: IdentityRegistry = load_borsh(registry_account)?;
    assert_registry_owner(&registry, owner)?;

    registry.sensitive_fields.push(EncryptedSensitiveField {
        field_type: params.field_type,
        nonce: params.nonce,
        ciphertext: params.ciphertext,
        metadata: params.metadata,
        proof_hash: params.user_authorization_hash,
        linked_at: Clock::get()?.unix_timestamp,
    });

    top_up_and_realloc(owner, registry_account, system_program, registry.dynamic_space())?;
    store_borsh(registry_account, &registry)
}

pub fn link_verified_social_identity(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: LinkVerifiedSocialIdentityParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let owner = next_account_info(accounts_iter)?;
    let registry_account = next_account_info(accounts_iter)?;
    let platform_registry_account = next_account_info(accounts_iter)?;
    let instructions_sysvar = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    if *instructions_sysvar.key != INSTRUCTIONS_ID {
        return Err(ProgramError::InvalidArgument);
    }
    assert_program_owned(registry_account, program_id)?;
    assert_program_owned(platform_registry_account, program_id)?;
    validate_social_params(
        &params.identity_type,
        &params.label,
        &params.nonce,
        &params.ciphertext,
        &params.metadata,
    )?;

    let mut registry: IdentityRegistry = load_borsh(registry_account)?;
    assert_registry_owner(&registry, owner)?;

    let platform_registry: PlatformRegistry = load_borsh(platform_registry_account)?;
    let platform_active = platform_registry
        .platforms
        .iter()
        .any(|platform| platform.public_key == params.platform_pubkey && platform.status == PLATFORM_ACTIVE);
    if !platform_active {
        return Err(Error::UnauthorizedClaimant.into());
    }
    if !verify_ed25519_ix_data(instructions_sysvar, &params.platform_pubkey, &params.proof_message)? {
        return Err(Error::SignatureVerificationFailed.into());
    }

    registry.social_identities.push(EncryptedSocialIdentity {
        identity_type: params.identity_type,
        label: params.label,
        nonce: params.nonce,
        ciphertext: params.ciphertext,
        metadata: params.metadata,
        verified_by: Some(params.platform_pubkey),
        proof_hash: hash(&params.proof_message).to_bytes(),
        linked_at: Clock::get()?.unix_timestamp,
    });

    top_up_and_realloc(owner, registry_account, system_program, registry.dynamic_space())?;
    store_borsh(registry_account, &registry)
}

fn verify_ed25519_ix_data(
    instructions_sysvar: &AccountInfo,
    expected_pubkey: &Pubkey,
    expected_message: &[u8],
) -> Result<bool, ProgramError> {
    let current_index = load_current_index_checked(instructions_sysvar)? as usize;
    for index in 0..current_index {
        if let Ok(ix) = load_instruction_at_checked(index, instructions_sysvar) {
            if ix.program_id != solana_program::ed25519_program::ID {
                continue;
            }
            let data = ix.data;
            if data.len() < 16 || data[0] != 1 {
                continue;
            }
            let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
            let message_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
            let message_size = u16::from_le_bytes([data[12], data[13]]) as usize;
            if pubkey_offset + 32 > data.len() || message_offset + message_size > data.len() {
                continue;
            }
            let parsed_pubkey = &data[pubkey_offset..pubkey_offset + 32];
            let parsed_message = &data[message_offset..message_offset + message_size];
            if parsed_pubkey == expected_pubkey.as_ref() && parsed_message == expected_message {
                return Ok(true);
            }
        }
    }
    Ok(false)
}
