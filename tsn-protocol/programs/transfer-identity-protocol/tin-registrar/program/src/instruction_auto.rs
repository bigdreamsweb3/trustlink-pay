use borsh::{BorshDeserialize, BorshSerialize};
use num_derive::FromPrimitive;
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program,
};

/// Active TIP ABI. Discriminant gaps are intentional so current instructions
/// retain their deployed numeric tags; removed legacy tags are rejected.
#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize, FromPrimitive)]
pub enum ProgramInstruction {
    InitializeProgram = 0,
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
pub struct CreateTinV1Params {
    pub owner_pubkey: Pubkey,
    pub lookup_commitment: [u8; 32],
    pub encrypted_tin_recovery: Vec<u8>,
    pub encrypted_identity_envelope: Vec<u8>,
    pub encrypted_master_seed: Vec<u8>,
    pub encrypted_metadata_hash: [u8; 32],
    pub route_version: u64,
    pub route_nonce: [u8; 32],
    pub tip_route_version: u8,
    pub gpru_elgamal_key_version: u8,
    pub gpru_elgamal_public_key: [u8; 32],
    pub gpru_elgamal_key_commitment: [u8; 32],
    pub policy_commitment: [u8; 32],
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
    pub encrypted_metadata_hash: [u8; 32],
    pub route_version: u64,
    pub route_nonce: [u8; 32],
    pub tip_route_version: u8,
    pub gpru_elgamal_key_version: u8,
    pub gpru_elgamal_public_key: [u8; 32],
    pub gpru_elgamal_key_commitment: [u8; 32],
    pub policy_commitment: [u8; 32],
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

pub fn create_tin_v1(
    program_id: Pubkey,
    payer: Pubkey,
    global_state: Pubkey,
    route_root: Pubkey,
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
            AccountMeta::new(route_root, false),
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
    route_root: Pubkey,
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
            AccountMeta::new(route_root, false),
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
