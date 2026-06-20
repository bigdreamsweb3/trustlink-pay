use crate::instruction_auto::{
    ClaimEscrowParams, CreateEscrowParams, InitializeIdentityParams, InitializeProgramParams,
    CreateTinParams, InitializePlatformRegistryParams, LinkSensitiveFieldParams,
    LinkSocialIdentityParams, LinkVerifiedSocialIdentityParams, ProgramInstruction,
    RemoveVerificationPlatformParams, ResolveTinParams, UpdateTinParams, UpsertVerificationPlatformParams,
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
pub mod create_tin;
pub mod update_tin;
pub mod identity_links;
pub mod resolve_tin;
pub mod platform_registry;

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
            ProgramInstruction::CreateTin => {
                msg!("Instruction: CreateTinDisabledDirectPath");
                Err(ProgramError::InvalidInstructionData)
            }
            ProgramInstruction::ResolveTin => {
                msg!("Instruction: ResolveTin");
                let params = ResolveTinParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                resolve_tin::process(program_id, accounts, params)
            }
            ProgramInstruction::InitializePlatformRegistry => {
                msg!("Instruction: InitializePlatformRegistry");
                let params = InitializePlatformRegistryParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                platform_registry::initialize(program_id, accounts, params)
            }
            ProgramInstruction::UpsertVerificationPlatform => {
                msg!("Instruction: UpsertVerificationPlatform");
                let params = UpsertVerificationPlatformParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                platform_registry::upsert_platform(program_id, accounts, params)
            }
            ProgramInstruction::RemoveVerificationPlatform => {
                msg!("Instruction: RemoveVerificationPlatform");
                let params = RemoveVerificationPlatformParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                platform_registry::remove_platform(program_id, accounts, params)
            }
            ProgramInstruction::LinkSocialIdentity => {
                msg!("Instruction: LinkSocialIdentity");
                let params = LinkSocialIdentityParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                identity_links::link_social_identity(program_id, accounts, params)
            }
            ProgramInstruction::LinkSensitiveField => {
                msg!("Instruction: LinkSensitiveField");
                let params = LinkSensitiveFieldParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                identity_links::link_sensitive_field(program_id, accounts, params)
            }
            ProgramInstruction::LinkVerifiedSocialIdentity => {
                msg!("Instruction: LinkVerifiedSocialIdentity");
                let params = LinkVerifiedSocialIdentityParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                identity_links::link_verified_social_identity(program_id, accounts, params)
            }
            ProgramInstruction::TinCreationRegistry => {
                msg!("Instruction: tin_creation_registry");
                let params = CreateTinParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                create_tin::process(program_id, accounts, params)
            }
            ProgramInstruction::TinUpdate => {
                msg!("Instruction: tin_update");
                let params = UpdateTinParams::try_from_slice(instruction_data)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                update_tin::process(program_id, accounts, params)
            }
        }
    }
}
