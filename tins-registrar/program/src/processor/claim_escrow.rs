use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::Sysvar,
};

use crate::{
    cpi::transfer_signed,
    error::Error,
    instruction_auto::ClaimEscrowParams,
    state::{EscrowState, IdentityRegistry, ESCROW_CLAIMED, ESCROW_PENDING},
    utils::{assert_program_owned, load_borsh, store_borsh},
};

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _params: ClaimEscrowParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let claimant = next_account_info(accounts_iter)?;
    let registry = next_account_info(accounts_iter)?;
    let escrow = next_account_info(accounts_iter)?;
    let vault = next_account_info(accounts_iter)?;
    let destination = next_account_info(accounts_iter)?;
    let _system_program = next_account_info(accounts_iter)?;

    if !claimant.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    assert_program_owned(registry, program_id)?;
    assert_program_owned(escrow, program_id)?;

    let registry_state: IdentityRegistry = load_borsh(registry)?;
    let mut escrow_state: EscrowState = load_borsh(escrow)?;

    if escrow_state.status != ESCROW_PENDING {
        return Err(Error::EscrowAlreadyClaimed.into());
    }
    if registry_state.authority != *claimant.key || escrow_state.recipient_authority != *claimant.key {
        return Err(Error::UnauthorizedClaimant.into());
    }
    if escrow_state.vault != *vault.key {
        return Err(Error::InvalidPda.into());
    }

    let tin_bytes = escrow_state.tin.to_le_bytes();
    let escrow_id_bytes = escrow_state.escrow_id.to_le_bytes();
    let (_, vault_bump) = crate::vault_pda(program_id, escrow_state.tin, escrow_state.escrow_id);
    let vault_seeds: [&[u8]; 4] = [
        crate::seeds::VAULT,
        &tin_bytes,
        &escrow_id_bytes,
        &[vault_bump],
    ];

    transfer_signed(vault, destination, escrow_state.amount, &vault_seeds)?;

    let remaining_lamports = vault.lamports();
    if remaining_lamports > 0 {
        transfer_signed(vault, claimant, remaining_lamports, &vault_seeds)?;
    }

    escrow_state.status = ESCROW_CLAIMED;
    escrow_state.claimed_at = Clock::get()?.unix_timestamp;
    escrow_state.destination = *destination.key;
    store_borsh(escrow, &escrow_state)
}
