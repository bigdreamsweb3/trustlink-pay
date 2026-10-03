use borsh::{BorshDeserialize, BorshSerialize};
use num_derive::FromPrimitive;
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program,
};

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize, FromPrimitive)]
pub enum ProgramInstruction {
    InitializeProgram = 0,
    InitializeIdentity = 1,
    CreateEscrow = 2,
    ClaimEscrow = 3,
    CreateTin = 4,
    ResolveTin = 5,
    InitializePlatformRegistry = 6,
    UpsertVerificationPlatform = 7,
    RemoveVerificationPlatform = 8,
    LinkSocialIdentity = 9,
    LinkSensitiveField = 10,
    LinkVerifiedSocialIdentity = 11,
    TinCreationRegistry = 12,
    TinUpdate = 13,
    TinMutationStage = 14,
    TinMutationChunk = 15,
    TinUpdateStaged = 16,
    CreateTinV1 = 17,
    ResolveTinV1 = 18,
    TinV1CreationStage = 19,
    TinV1CreationChunk = 20,
    TinV1CreationFinalize = 21,
    TinV1CreationClose = 22,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct InitializeProgramParams {
    pub starting_sequence: u64,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct InitializeIdentityParams {
    pub name: String,
    pub master_privacy: Pubkey,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct CreateEscrowParams {
    pub amount_lamports: u64,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct ClaimEscrowParams {}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct CreateTinParams {
    pub owner_pubkey: Pubkey,
    pub display_name: String,
    pub encrypted_master_seed: Vec<u8>,
    pub encrypted_metadata_hash: [u8; 32],
    pub pru_configuration_hash: [u8; 32],
    pub encrypted_public_route_envelope: Vec<u8>,
    pub route_version: u64,
    pub route_nonce: [u8; 32],
    pub tcap_route_version: u8,
    pub tcap_relationship_commitment: [u8; 32],
    pub tcap_relationship_reference: [u8; 32],
    pub tcap_policy_commitment: [u8; 32],
    pub nonce: [u8; 32],
    pub intent_hash: [u8; 32],
    pub expiry_ts: i64,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct UpdateTinParams {
    pub owner_pubkey: Pubkey,
    pub display_name: String,
    pub encrypted_master_seed: Vec<u8>,
    pub encrypted_metadata_hash: [u8; 32],
    pub pru_configuration_hash: [u8; 32],
    pub encrypted_public_route_envelope: Vec<u8>,
    pub route_version: u64,
    pub route_nonce: [u8; 32],
    pub tcap_route_version: u8,
    pub tcap_relationship_commitment: [u8; 32],
    pub tcap_relationship_reference: [u8; 32],
    pub tcap_policy_commitment: [u8; 32],
    pub nonce: [u8; 32],
    pub intent_hash: [u8; 32],
    pub expiry_ts: i64,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct StageTinMutationParams {
    pub owner_pubkey: Pubkey,
    pub intent_hash: [u8; 32],
    pub display_name: String,
    pub encrypted_metadata_hash: [u8; 32],
    pub pru_configuration_hash: [u8; 32],
    pub route_version: u64,
    pub route_nonce: [u8; 32],
    pub tcap_route_version: u8,
    pub tcap_relationship_commitment: [u8; 32],
    pub tcap_relationship_reference: [u8; 32],
    pub tcap_policy_commitment: [u8; 32],
    pub nonce: [u8; 32],
    pub expiry_ts: i64,
    pub encrypted_master_seed_len: u32,
    pub encrypted_public_route_envelope_len: u32,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct TinMutationChunkParams {
    pub kind: u8,
    pub offset: u32,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct FinalizeTinUpdateParams {
    pub intent_hash: [u8; 32],
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct ResolveTinParams {
    pub wallet_pubkey: Pubkey,
    pub challenge_nonce: [u8; 32],
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct CreateTinV1Params {
    pub owner_pubkey: Pubkey,
    pub lookup_commitment: [u8; 32],
    pub encrypted_tin_recovery: Vec<u8>,
    pub encrypted_identity_envelope: Vec<u8>,
    pub encrypted_master_seed: Vec<u8>,
    pub encrypted_metadata_hash: [u8; 32],
    pub pru_configuration_hash: [u8; 32],
    pub encrypted_public_route_envelope: Vec<u8>,
    pub route_version: u64,
    pub route_nonce: [u8; 32],
    pub tcap_route_version: u8,
    pub tcap_relationship_commitment: [u8; 32],
    pub tcap_relationship_reference: [u8; 32],
    pub tcap_policy_commitment: [u8; 32],
    pub intent_hash: [u8; 32],
    pub expiry_ts: i64,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct StageTinV1CreationParams {
    pub owner_pubkey: Pubkey,
    pub lookup_commitment: [u8; 32],
    pub intent_hash: [u8; 32],
    pub encrypted_identity_envelope_len: u32,
    pub encrypted_tin_recovery_len: u32,
    pub encrypted_master_seed_len: u32,
    pub encrypted_public_route_envelope_len: u32,
    pub encrypted_metadata_hash: [u8; 32],
    pub pru_configuration_hash: [u8; 32],
    pub route_version: u64,
    pub route_nonce: [u8; 32],
    pub tcap_route_version: u8,
    pub tcap_relationship_commitment: [u8; 32],
    pub tcap_relationship_reference: [u8; 32],
    pub tcap_policy_commitment: [u8; 32],
    pub expiry_ts: i64,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct TinV1CreationChunkParams {
    pub kind: u8,
    pub offset: u32,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct FinalizeTinV1CreationParams {
    pub intent_hash: [u8; 32],
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct ResolveTinV1Params {
    pub owner_pubkey: Pubkey,
    pub lookup_commitment: [u8; 32],
    pub challenge_nonce: [u8; 32],
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct InitializePlatformRegistryParams {}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct UpsertVerificationPlatformParams {
    pub platform_id: String,
    pub platform_pubkey: Pubkey,
    pub rotated_from: Option<Pubkey>,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct RemoveVerificationPlatformParams {
    pub platform_pubkey: Pubkey,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct LinkSocialIdentityParams {
    pub identity_type: String,
    pub label: String,
    pub nonce: Vec<u8>,
    pub ciphertext: Vec<u8>,
    pub metadata: String,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct LinkSensitiveFieldParams {
    pub field_type: String,
    pub nonce: Vec<u8>,
    pub ciphertext: Vec<u8>,
    pub metadata: String,
    pub user_authorization_hash: [u8; 32],
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct LinkVerifiedSocialIdentityParams {
    pub identity_type: String,
    pub label: String,
    pub nonce: Vec<u8>,
    pub ciphertext: Vec<u8>,
    pub metadata: String,
    pub platform_pubkey: Pubkey,
    pub proof_message: Vec<u8>,
}

fn encode<T: BorshSerialize>(tag: ProgramInstruction, params: &T) -> Vec<u8> {
    let mut data = vec![tag as u8];
    data.extend_from_slice(&params.try_to_vec().expect("instruction serialization"));
    data
}

pub fn initialize_program(
    program_id: Pubkey,
    payer: Pubkey,
    global_state: Pubkey,
    params: InitializeProgramParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer, true),
            AccountMeta::new(global_state, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode(ProgramInstruction::InitializeProgram, &params),
    }
}

pub fn initialize_identity(
    program_id: Pubkey,
    payer: Pubkey,
    global_state: Pubkey,
    registry: Pubkey,
    params: InitializeIdentityParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer, true),
            AccountMeta::new(global_state, false),
            AccountMeta::new(registry, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode(ProgramInstruction::InitializeIdentity, &params),
    }
}

pub fn create_escrow(
    program_id: Pubkey,
    payer: Pubkey,
    registry: Pubkey,
    escrow: Pubkey,
    vault: Pubkey,
    params: CreateEscrowParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer, true),
            AccountMeta::new(registry, false),
            AccountMeta::new(escrow, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode(ProgramInstruction::CreateEscrow, &params),
    }
}

pub fn claim_escrow(
    program_id: Pubkey,
    claimant: Pubkey,
    registry: Pubkey,
    escrow: Pubkey,
    vault: Pubkey,
    destination: Pubkey,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(claimant, true),
            AccountMeta::new_readonly(registry, false),
            AccountMeta::new(escrow, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(destination, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode(ProgramInstruction::ClaimEscrow, &ClaimEscrowParams {}),
    }
}

pub fn create_tin(
    program_id: Pubkey,
    payer: Pubkey,
    global_state: Pubkey,
    identity: Pubkey,
    params: CreateTinParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer, true),
            AccountMeta::new(global_state, false),
            AccountMeta::new(identity, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode(ProgramInstruction::CreateTin, &params),
    }
}

pub fn resolve_tin(
    program_id: Pubkey,
    identity: Pubkey,
    instructions_sysvar: Pubkey,
    params: ResolveTinParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(identity, false),
            AccountMeta::new_readonly(instructions_sysvar, false),
        ],
        data: encode(ProgramInstruction::ResolveTin, &params),
    }
}

pub fn create_tin_v1(
    program_id: Pubkey,
    payer: Pubkey,
    global_state: Pubkey,
    registry: Pubkey,
    owner_recovery: Pubkey,
    instructions_sysvar: Pubkey,
    params: CreateTinV1Params,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer, true),
            AccountMeta::new(global_state, false),
            AccountMeta::new(registry, false),
            AccountMeta::new(owner_recovery, false),
            AccountMeta::new_readonly(instructions_sysvar, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode(ProgramInstruction::CreateTinV1, &params),
    }
}

pub fn stage_tin_v1_creation(
    program_id: Pubkey,
    payer: Pubkey,
    staging: Pubkey,
    params: StageTinV1CreationParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer, true),
            AccountMeta::new(staging, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode(ProgramInstruction::TinV1CreationStage, &params),
    }
}

pub fn tin_v1_creation_chunk(
    program_id: Pubkey,
    payer: Pubkey,
    staging: Pubkey,
    params: TinV1CreationChunkParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![AccountMeta::new(payer, true), AccountMeta::new(staging, false)],
        data: encode(ProgramInstruction::TinV1CreationChunk, &params),
    }
}

pub fn finalize_tin_v1_creation(
    program_id: Pubkey,
    payer: Pubkey,
    global_state: Pubkey,
    registry: Pubkey,
    owner_recovery: Pubkey,
    instructions_sysvar: Pubkey,
    staging: Pubkey,
    params: FinalizeTinV1CreationParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer, true),
            AccountMeta::new(global_state, false),
            AccountMeta::new(registry, false),
            AccountMeta::new(owner_recovery, false),
            AccountMeta::new_readonly(instructions_sysvar, false),
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new(staging, false),
        ],
        data: encode(ProgramInstruction::TinV1CreationFinalize, &params),
    }
}

pub fn close_tin_v1_creation_stage(
    program_id: Pubkey,
    cranker: Pubkey,
    staging: Pubkey,
    params: FinalizeTinV1CreationParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![AccountMeta::new(cranker, true), AccountMeta::new(staging, false)],
        data: encode(ProgramInstruction::TinV1CreationClose, &params),
    }
}

pub fn resolve_tin_v1(
    program_id: Pubkey,
    registry: Pubkey,
    instructions_sysvar: Pubkey,
    params: ResolveTinV1Params,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(registry, false),
            AccountMeta::new_readonly(instructions_sysvar, false),
        ],
        data: encode(ProgramInstruction::ResolveTinV1, &params),
    }
}

pub fn initialize_platform_registry(
    program_id: Pubkey,
    authority: Pubkey,
    platform_registry: Pubkey,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(authority, true),
            AccountMeta::new(platform_registry, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode(
            ProgramInstruction::InitializePlatformRegistry,
            &InitializePlatformRegistryParams {},
        ),
    }
}

pub fn upsert_verification_platform(
    program_id: Pubkey,
    authority: Pubkey,
    platform_registry: Pubkey,
    params: UpsertVerificationPlatformParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(authority, true),
            AccountMeta::new(platform_registry, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode(ProgramInstruction::UpsertVerificationPlatform, &params),
    }
}

pub fn remove_verification_platform(
    program_id: Pubkey,
    authority: Pubkey,
    platform_registry: Pubkey,
    params: RemoveVerificationPlatformParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(authority, true),
            AccountMeta::new(platform_registry, false),
        ],
        data: encode(ProgramInstruction::RemoveVerificationPlatform, &params),
    }
}

pub fn link_social_identity(
    program_id: Pubkey,
    owner: Pubkey,
    registry: Pubkey,
    params: LinkSocialIdentityParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(owner, true),
            AccountMeta::new(registry, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode(ProgramInstruction::LinkSocialIdentity, &params),
    }
}

pub fn link_sensitive_field(
    program_id: Pubkey,
    owner: Pubkey,
    registry: Pubkey,
    params: LinkSensitiveFieldParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(owner, true),
            AccountMeta::new(registry, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode(ProgramInstruction::LinkSensitiveField, &params),
    }
}

pub fn link_verified_social_identity(
    program_id: Pubkey,
    owner: Pubkey,
    registry: Pubkey,
    platform_registry: Pubkey,
    instructions_sysvar: Pubkey,
    params: LinkVerifiedSocialIdentityParams,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(owner, true),
            AccountMeta::new(registry, false),
            AccountMeta::new_readonly(platform_registry, false),
            AccountMeta::new_readonly(instructions_sysvar, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode(ProgramInstruction::LinkVerifiedSocialIdentity, &params),
    }
}
