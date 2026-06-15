use anchor_lang::{
    prelude::*,
    solana_program::{
        program::invoke_signed,
        program_pack::Pack,
        system_instruction,
    },
    system_program::{self, Transfer as SystemTransfer},
};
use anchor_spl::token::{
    self, InitializeAccount3, Mint, Token, TokenAccount, TransferChecked,
};

use crate::tsn::{
    constants::{
        TSN_CRANKER_SEED, TSN_PAYMENT_INTENT_GAS_REIMBURSEMENT_LAMPORTS,
        TSN_SHARED_ESCROW_AUTHORITY_SEED, TSN_VERIFIER_SEED,
    },
    errors::TsnError,
    events::TsnPrivateCommitmentRegistered,
    state::{Cranker, MotherEscrow},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
#[instruction(commitment_hash: [u8; 32])]
pub struct RegisterPrivateCommitment<'info> {
    #[account(mut)]
    pub cranker_operator: Signer<'info>,

    pub sender_authority: Signer<'info>,

    pub mother_escrow: Box<Account<'info, MotherEscrow>>,

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
    pub cranker: Box<Account<'info, Cranker>>,

    #[account(
        mut,
        constraint = sender_token_account.owner == sender_authority.key()
            @ TsnError::InvalidPrivateEscrowTokenAccount,
        constraint = sender_token_account.mint == token_mint.key()
            @ TsnError::InvalidPrivateEscrowTokenAccount
    )]
    pub sender_token_account: Box<Account<'info, TokenAccount>>,

    pub token_mint: Box<Account<'info, Mint>>,

    /// CHECK: Shared authority controls one-time escrow token-account PDAs.
    #[account(
        seeds = [TSN_SHARED_ESCROW_AUTHORITY_SEED, mother_escrow.key().as_ref()],
        bump
    )]
    pub shared_escrow_authority: UncheckedAccount<'info>,

    /// CHECK: Random one-time token account signed by its ephemeral keypair and
    /// funded by the verifier PDA inside this instruction.
    #[account(mut)]
    pub escrow_token_account: UncheckedAccount<'info>,

    /// CHECK: Protocol SOL reservoir pays escrow account rent and reimburses gas.
    #[account(mut, seeds = [TSN_VERIFIER_SEED], bump)]
    pub verifier_pda: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn register_private_commitment(
    ctx: Context<RegisterPrivateCommitment>,
    commitment_hash: [u8; 32],
    amount: u64,
) -> Result<()> {
    require!(
        commitment_hash != [0; 32] && amount > 0,
        TsnError::InvalidPrivateCommitment
    );
    require!(
        ctx.accounts.escrow_token_account.lamports() == 0
            && ctx.accounts.escrow_token_account.data_is_empty(),
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

    let token_account_space = anchor_spl::token::spl_token::state::Account::LEN;
    let token_account_rent = Rent::get()?.minimum_balance(token_account_space);
    let reimbursement = TSN_PAYMENT_INTENT_GAS_REIMBURSEMENT_LAMPORTS;
    let required_verifier_lamports = token_account_rent
        .checked_add(reimbursement)
        .ok_or(TsnError::FeeSplitOverflow)?;
    require!(
        ctx.accounts.verifier_pda.lamports() >= required_verifier_lamports,
        TsnError::InsufficientVerifierLamports
    );

    let verifier_bump = ctx.bumps.verifier_pda;
    let verifier_bump_seed = [verifier_bump];
    let verifier_signer: &[&[u8]] = &[TSN_VERIFIER_SEED, &verifier_bump_seed];
    invoke_signed(
        &system_instruction::create_account(
            &ctx.accounts.verifier_pda.key(),
            &ctx.accounts.escrow_token_account.key(),
            token_account_rent,
            token_account_space as u64,
            &ctx.accounts.token_program.key(),
        ),
        &[
            ctx.accounts.verifier_pda.to_account_info(),
            ctx.accounts.escrow_token_account.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[verifier_signer],
    )?;

    token::initialize_account3(CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        InitializeAccount3 {
            account: ctx.accounts.escrow_token_account.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
            authority: ctx.accounts.shared_escrow_authority.to_account_info(),
        },
    ))?;
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.sender_token_account.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.escrow_token_account.to_account_info(),
                authority: ctx.accounts.sender_authority.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.token_mint.decimals,
    )?;
    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            SystemTransfer {
                from: ctx.accounts.verifier_pda.to_account_info(),
                to: ctx.accounts.cranker_operator.to_account_info(),
            },
            &[verifier_signer],
        ),
        reimbursement,
    )?;

    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.cranker.claim_credits = ctx
        .accounts
        .cranker
        .claim_credits
        .checked_add(1)
        .ok_or(TsnError::CrankerClaimCreditOverflow)?;
    ctx.accounts.cranker.last_active_ts = now;

    emit!(TsnPrivateCommitmentRegistered {
        commitment_hash,
        token_mint: ctx.accounts.token_mint.key(),
        amount,
        epoch_id: mother_escrow.epoch_id,
    });
    Ok(())
}
