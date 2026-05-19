use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    program::{invoke_signed},
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

pub fn create_pda_account<'a>(
    payer: &AccountInfo<'a>,
    account_to_create: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    owner: &solana_program::pubkey::Pubkey,
    space: usize,
    lamports: u64,
    signer_seeds: &[&[u8]],
) -> ProgramResult {
    let required_lamports = Rent::get()?.minimum_balance(space).saturating_add(lamports);
    let instruction = system_instruction::create_account(
        payer.key,
        account_to_create.key,
        required_lamports,
        space as u64,
        owner,
    );

    invoke_signed(
        &instruction,
        &[payer.clone(), account_to_create.clone(), system_program.clone()],
        &[signer_seeds],
    )
}

pub fn transfer_signed<'a>(
    source: &AccountInfo<'a>,
    destination: &AccountInfo<'a>,
    amount: u64,
    signer_seeds: &[&[u8]],
) -> ProgramResult {
    let instruction = system_instruction::transfer(source.key, destination.key, amount);
    invoke_signed(&instruction, &[source.clone(), destination.clone()], &[signer_seeds])
}
