use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::{
    cpi::create_pda_account,
    error::Error,
    instruction_auto::InitializeProgramParams,
    state::{GlobalState, CURRENT_VERSION},
    utils::{assert_pda, store_borsh, MAX_TIN_SEQUENCE},
};

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: InitializeProgramParams,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let payer = next_account_info(accounts_iter)?;
    let global_state = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !global_state.data_is_empty() {
        return Err(Error::GlobalStateAlreadyInitialized.into());
    }
    if params.starting_sequence > MAX_TIN_SEQUENCE {
        return Err(Error::TinExhausted.into());
    }

    let (expected_global, bump) = crate::global_state_pda(program_id);
    assert_pda(global_state, &expected_global)?;

    let signer_seeds: [&[u8]; 2] = [crate::seeds::GLOBAL_STATE, &[bump]];
    create_pda_account(
        payer,
        global_state,
        system_program,
        program_id,
        GlobalState::LEN,
        0,
        &signer_seeds,
    )?;

    let state = GlobalState {
        version: CURRENT_VERSION,
        bump,
        reserved: [0; 6],
        next_sequence: params.starting_sequence,
    };
    store_borsh(global_state, &state)
}
