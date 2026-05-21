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
    pub display_name: String,
    pub encrypted_phone: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct ResolveTinParams {
    pub wallet_pubkey: Pubkey,
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
