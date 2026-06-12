use anchor_lang::{
    prelude::*,
    system_program::{self, CreateAccount, Transfer},
    Discriminator,
};
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::{
    associated_token::{self, get_associated_token_address, AssociatedToken, Create},
    token::{spl_token::state::Account as SplTokenAccount, Mint, Token},
};

use crate::tsn::{
    constants::{
        TSN_CRANKER_SEED, TSN_PAYMENT_INTENT_GAS_REIMBURSEMENT_LAMPORTS,
        TSN_PAYMENT_VAULT_SEED, TSN_VERIFIER_SEED,
    },
    errors::TsnError,
    events::TsnCommitmentRegistered,
    state::{Cranker, MotherEscrow, VaultSettlementStatus, VaultState},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
#[instruction(payment_intent_id: u64)]
pub struct ProcessPaymentIntent<'info> {
    #[account(mut)]
    pub cranker_operator: Signer<'info>,

    pub mother_escrow: Account<'info, MotherEscrow>,

    #[account(
        mut,
        seeds = [
            TSN_CRANKER_SEED,
            mother_escrow.key().as_ref(),
            cranker_operator.key().as_ref()
        ],
        bump = cranker.bump,
        has_one = mother_escrow,
        constraint = cranker.operator == cranker_operator.key()
    )]
    pub cranker: Account<'info, Cranker>,

    /// CHECK: Autonomous protocol SOL reservoir PDA. Must remain system-owned so it can fund account setup.
    #[account(
        mut,
        seeds = [TSN_VERIFIER_SEED],
        bump
    )]
    pub verifier_pda: UncheckedAccount<'info>,

    /// CHECK: Per-payment isolated vault PDA created inside the instruction with verifier PDA funding.
    #[account(
        mut,
        seeds = [TSN_PAYMENT_VAULT_SEED, payment_intent_id.to_le_bytes().as_ref()],
        bump
    )]
    pub unique_vault_account: UncheckedAccount<'info>,

    /// CHECK: Associated token account for the isolated payment vault.
    #[account(mut)]
    pub unique_token_account: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn process_payment_intent(
    ctx: Context<ProcessPaymentIntent>,
    payment_intent_id: u64,
    _amount: u64,
    transfer_id: [u8; 32],
    commitment_hash: [u8; 32],
) -> Result<()> {
    require!(
        ctx.accounts.unique_vault_account.data_is_empty(),
        TsnError::PaymentVaultAlreadyInitialized
    );
    require_keys_eq!(
        *ctx.accounts.verifier_pda.owner,
        system_program::ID,
        TsnError::InvalidVerifierPda
    );
    let mother_escrow = &ctx.accounts.mother_escrow;
    let expected_dna = compute_cranker_dna(
        &mother_escrow.key(),
        &ctx.accounts.cranker_operator.key(),
        &mother_escrow.protocol_seed,
    );
    require!(
        ctx.accounts.cranker.dna_hash == expected_dna,
        TsnError::CrankerDnaMismatch
    );

    let expected_ata = get_associated_token_address(
        &ctx.accounts.unique_vault_account.key(),
        &ctx.accounts.mint.key(),
    );
    require_keys_eq!(
        ctx.accounts.unique_token_account.key(),
        expected_ata,
        TsnError::InvalidUniqueTokenAccount
    );

    let verifier_bump = ctx.bumps.verifier_pda;
    let vault_bump = ctx.bumps.unique_vault_account;
    let payment_id_bytes = payment_intent_id.to_le_bytes();

    let verifier_signer: &[&[u8]] = &[TSN_VERIFIER_SEED, &[verifier_bump]];
    let vault_signer: &[&[u8]] = &[TSN_PAYMENT_VAULT_SEED, payment_id_bytes.as_ref(), &[vault_bump]];
    let create_signers: &[&[&[u8]]] = &[verifier_signer, vault_signer];

    let vault_space = 8 + VaultState::INIT_SPACE;
    let vault_rent = Rent::get()?.minimum_balance(vault_space);
    let token_account_rent = Rent::get()?.minimum_balance(SplTokenAccount::LEN);
    let required_lamports = vault_rent
        .checked_add(token_account_rent)
        .ok_or(TsnError::PaymentIntentFundingOverflow)?
        .checked_add(TSN_PAYMENT_INTENT_GAS_REIMBURSEMENT_LAMPORTS)
        .ok_or(TsnError::PaymentIntentFundingOverflow)?;
    require!(
        ctx.accounts.verifier_pda.lamports() >= required_lamports,
        TsnError::InsufficientVerifierLamports
    );

    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.verifier_pda.to_account_info(),
                to: ctx.accounts.unique_vault_account.to_account_info(),
            },
            create_signers,
        ),
        vault_rent,
        vault_space as u64,
        ctx.program_id,
    )?;

    {
        let mut data = ctx.accounts.unique_vault_account.try_borrow_mut_data()?;
        data[..8].copy_from_slice(&VaultState::discriminator());
        let state = VaultState {
            payment_intent_id,
            transfer_id,
            commitment_hash,
            otdt_hash: [0; 32],
            lease_cranker: Pubkey::default(),
            settlement_cranker: Pubkey::default(),
            lease_expiry_ts: 0,
            created_at_ts: Clock::get()?.unix_timestamp,
            paid_at_ts: 0,
            recovered_at_ts: 0,
            epoch_id: mother_escrow.epoch_id,
            status: VaultSettlementStatus::Created,
            otdt_used: false,
            recoverable: false,
            bump: vault_bump,
        };
        let mut cursor = &mut data[8..];
        AnchorSerialize::serialize(&state, &mut cursor)?;
    }

    associated_token::create(CpiContext::new_with_signer(
        ctx.accounts.associated_token_program.to_account_info(),
        Create {
            payer: ctx.accounts.verifier_pda.to_account_info(),
            associated_token: ctx.accounts.unique_token_account.to_account_info(),
            authority: ctx.accounts.unique_vault_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        },
        &[verifier_signer],
    ))?;

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.verifier_pda.to_account_info(),
                to: ctx.accounts.cranker_operator.to_account_info(),
            },
            &[verifier_signer],
        ),
        TSN_PAYMENT_INTENT_GAS_REIMBURSEMENT_LAMPORTS,
    )?;

    emit!(TsnCommitmentRegistered {
        vault: ctx.accounts.unique_vault_account.key(),
        transfer_id,
        commitment_hash,
        epoch_id: mother_escrow.epoch_id,
        created_at_ts: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
