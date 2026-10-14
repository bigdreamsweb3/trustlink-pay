use crate::instruction_auto::{
    CreateTinV1Params, FinalizeTinV1CreationParams, InitializeProgramParams, ProgramInstruction,
    ResolveTinV1Params, StageTinV1CreationParams, TinV1CreationChunkParams,
};
use borsh::BorshDeserialize;
use num_traits::FromPrimitive;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
    pubkey::Pubkey,
};

pub mod init_program;
pub mod create_tin_v1;
pub mod tin_v1_creation_staging;
pub mod resolve_tin_v1;

pub struct Processor;

impl Processor {
    pub fn process_instruction(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        if instruction_data.is_empty() {
            return Err(ProgramError::InvalidInstructionData);
        }

        let instruction = FromPrimitive::from_u8(instruction_data[0])
            .ok_or(ProgramError::InvalidInstructionData)?;
        let instruction_data = &instruction_data[1..];

        match instruction {
            ProgramInstruction::InitializeProgram => {
                msg!("Instruction: InitializeProgram");
                let params = InitializeProgramParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                init_program::process(program_id, accounts, params)
            }
            ProgramInstruction::CreateTinV1 => {
                msg!("Instruction: CreateTinV1");
                let params = CreateTinV1Params::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                create_tin_v1::process(program_id, accounts, params)
            }
            ProgramInstruction::ResolveTinV1 => {
                msg!("Instruction: ResolveTinV1");
                let params = ResolveTinV1Params::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                resolve_tin_v1::process(program_id, accounts, params)
            }
            ProgramInstruction::TinV1CreationStage => {
                let params = StageTinV1CreationParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                tin_v1_creation_staging::stage(program_id, accounts, params)
            }
            ProgramInstruction::TinV1CreationChunk => {
                let params = TinV1CreationChunkParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                tin_v1_creation_staging::append_chunk(program_id, accounts, params)
            }
            ProgramInstruction::TinV1CreationFinalize => {
                let params = FinalizeTinV1CreationParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                tin_v1_creation_staging::finalize(program_id, accounts, params)
            }
            ProgramInstruction::TinV1CreationClose => {
                let params = FinalizeTinV1CreationParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                tin_v1_creation_staging::close_expired(program_id, accounts, params)
            }
        }
    }
}
