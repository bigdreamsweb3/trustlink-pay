use crate::instruction_auto::{
    ClaimEscrowParams, CreateEscrowParams, InitializeIdentityParams, InitializeProgramParams,
    ProgramInstruction,
};
use borsh::BorshDeserialize;
use num_traits::FromPrimitive;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
    pubkey::Pubkey,
};

pub mod claim_escrow;
pub mod create_escrow;
pub mod init_program;
pub mod initialize_identity;

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
            ProgramInstruction::InitializeIdentity => {
                msg!("Instruction: InitializeIdentity");
                let params = InitializeIdentityParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                initialize_identity::process(program_id, accounts, params)
            }
            ProgramInstruction::CreateEscrow => {
                msg!("Instruction: CreateEscrow");
                let params = CreateEscrowParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                create_escrow::process(program_id, accounts, params)
            }
            ProgramInstruction::ClaimEscrow => {
                msg!("Instruction: ClaimEscrow");
                let params = ClaimEscrowParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                claim_escrow::process(program_id, accounts, params)
            }
        }
    }
}
