use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program,
    sysvar::Sysvar,
};

use crate::{
    cpi::create_pda_account,
    error::Error,
    instruction_auto::CreateEscrowParams,
    state::{EscrowState, IdentityRegistry, CURRENT_VERSION, ESCROW_PENDING},
    utils::{assert_pda, assert_program_owned, load_borsh, store_borsh},
};

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: CreateEscrowParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let payer = next_account_info(accounts_iter)?;
    let registry = next_account_info(accounts_iter)?;
    let escrow = next_account_info(accounts_iter)?;
    let vault = next_account_info(accounts_iter)?;
    let system_program_account = next_account_info(accounts_iter)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if params.amount_lamports == 0 {
        return Err(Error::InvalidAmount.into());
    }
    assert_program_owned(registry, program_id)?;

    let mut registry_state: IdentityRegistry = load_borsh(registry)?;
    let escrow_id = registry_state
        .last_escrow_id
        .checked_add(1)
        .ok_or(Error::Overflow)?;

    let (expected_escrow, escrow_bump) =
        crate::escrow_pda(program_id, registry_state.tin, escrow_id);
    let (expected_vault, vault_bump) = crate::vault_pda(program_id, registry_state.tin, escrow_id);
    assert_pda(escrow, &expected_escrow)?;
    assert_pda(vault, &expected_vault)?;

    let tin_bytes = registry_state.tin.to_le_bytes();
    let escrow_id_bytes = escrow_id.to_le_bytes();
    let escrow_seeds: [&[u8]; 4] = [
        crate::seeds::ESCROW,
        &tin_bytes,
        &escrow_id_bytes,
        &[escrow_bump],
    ];
    let vault_seeds: [&[u8]; 4] = [
        crate::seeds::VAULT,
        &tin_bytes,
        &escrow_id_bytes,
        &[vault_bump],
    ];

    create_pda_account(
        payer,
        escrow,
        system_program_account,
        program_id,
        EscrowState::LEN,
        0,
        &escrow_seeds,
    )?;
    create_pda_account(
        payer,
        vault,
        system_program_account,
        &system_program::ID,
        0,
        params.amount_lamports,
        &vault_seeds,
    )?;

    let escrow_state = EscrowState {
        version: CURRENT_VERSION,
        bump: escrow_bump,
        status: ESCROW_PENDING,
        reserved: [0; 5],
        tin: registry_state.tin,
        escrow_id,
        amount: params.amount_lamports,
        payer: *payer.key,
        recipient_authority: registry_state.authority,
        vault: *vault.key,
        created_at: Clock::get()?.unix_timestamp,
        claimed_at: 0,
        destination: Pubkey::default(),
    };
    store_borsh(escrow, &escrow_state)?;

    registry_state.last_escrow_id = escrow_id;
    store_borsh(registry, &registry_state)
}
