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
        TSN_PRU_SPEND_GUARD_SEED, TSN_SHARED_ESCROW_AUTHORITY_SEED, TSN_TREASURY_SEED,
        TSN_VERIFIER_SEED,
    },
    errors::TsnError,
    events::TsnPruSpendExecuted,
    state::{Cranker, MotherEscrow, PruSpendGuard},
    utils::compute_cranker_dna,
};

#[derive(Accounts)]
#[instruction(tin: u64, pru_index: u16, nonce: u8, commitment_hash: [u8; 32])]
pub struct ExecutePruSpend<'info> {
    #[account(mut)]
    pub cranker_operator: Signer<'info>,

    pub pru_authority: Signer<'info>,

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
        init_if_needed,
        payer = cranker_operator,
        space = PruSpendGuard::SPACE,
        seeds = [
            TSN_PRU_SPEND_GUARD_SEED,
            tin.to_le_bytes().as_ref(),
            pru_index.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub pru_spend_guard: Box<Account<'info, PruSpendGuard>>,

    #[account(
        mut,
        constraint = pru_token_account.owner == pru_authority.key()
            @ TsnError::InvalidPruSpendAuthority,
        constraint = pru_token_account.mint == token_mint.key()
            @ TsnError::InvalidPruSpendAuthority
    )]
    pub pru_token_account: Box<Account<'info, TokenAccount>>,

    pub token_mint: Box<Account<'info, Mint>>,

    /// CHECK: Treasury PDA owns the sender-fee token account.
    #[account(seeds = [TSN_TREASURY_SEED], bump)]
    pub treasury_pda: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = treasury_token_account.owner == treasury_pda.key(),
        constraint = treasury_token_account.mint == token_mint.key()
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: Shared authority controls one-time escrow token-account PDAs.
    #[account(
        seeds = [TSN_SHARED_ESCROW_AUTHORITY_SEED, mother_escrow.key().as_ref()],
        bump
    )]
    pub shared_escrow_authority: UncheckedAccount<'info>,

    /// CHECK: Random one-time token account signed by its ephemeral keypair and
    /// funded by the verifier PDA inside this instruction.
    #[account(mut, signer)]
    pub escrow_token_account: UncheckedAccount<'info>,

    /// CHECK: Protocol SOL reservoir pays escrow account rent and reimburses gas.
    #[account(mut, seeds = [TSN_VERIFIER_SEED], bump)]
    pub verifier_pda: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn execute_pru_spend(
    ctx: Context<ExecutePruSpend>,
    tin: u64,
    pru_index: u16,
    nonce: u8,
    commitment_hash: [u8; 32],
    spend_auth_hash: [u8; 32],
    amount: u64,
    sender_fee_amount: u64,
) -> Result<()> {
    require!(
        commitment_hash != [0; 32] && (amount > 0 || sender_fee_amount > 0),
        TsnError::InvalidPrivateCommitment
    );
    if !ctx.accounts.pru_spend_guard.active
        && ctx.accounts.pru_spend_guard.spend_auth_hash == [0; 32]
        && ctx.accounts.pru_spend_guard.nonce_bitmask == [0; 32]
    {
        ctx.accounts.pru_spend_guard.tin = tin;
        ctx.accounts.pru_spend_guard.pru_index = pru_index;
        ctx.accounts.pru_spend_guard.spend_auth_hash = spend_auth_hash;
        ctx.accounts.pru_spend_guard.active = true;
        ctx.accounts.pru_spend_guard.bump = ctx.bumps.pru_spend_guard;
    }
    require!(
        ctx.accounts.pru_spend_guard.tin == tin
            && ctx.accounts.pru_spend_guard.pru_index == pru_index,
        TsnError::InvalidPruSpendAuthority
    );
    require!(ctx.accounts.pru_spend_guard.active, TsnError::InactivePruSpendGuard);
    require!(
        ctx.accounts.pru_spend_guard.spend_auth_hash == spend_auth_hash,
        TsnError::InvalidPruSpendAuthority
    );
    require!(
        !ctx.accounts.pru_spend_guard.nonce_is_used(nonce),
        TsnError::PruSpendNonceAlreadyUsed
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
    let escrow_is_empty = ctx.accounts.escrow_token_account.lamports() == 0
        && ctx.accounts.escrow_token_account.data_is_empty();
    let required_verifier_lamports = (if escrow_is_empty { token_account_rent } else { 0 })
        .checked_add(reimbursement)
        .ok_or(TsnError::FeeSplitOverflow)?;
    require!(
        ctx.accounts.verifier_pda.lamports() >= required_verifier_lamports,
        TsnError::InsufficientVerifierLamports
    );

    let verifier_bump = ctx.bumps.verifier_pda;
    let verifier_bump_seed = [verifier_bump];
    let verifier_signer: &[&[u8]] = &[TSN_VERIFIER_SEED, &verifier_bump_seed];
    if escrow_is_empty {
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
    } else {
        let escrow_data = ctx.accounts.escrow_token_account.try_borrow_data()?;
        let escrow_account = anchor_spl::token::spl_token::state::Account::unpack(&escrow_data)?;
        require_keys_eq!(
            escrow_account.mint,
            ctx.accounts.token_mint.key(),
            TsnError::InvalidPrivateEscrowTokenAccount
        );
        require_keys_eq!(
            escrow_account.owner,
            ctx.accounts.shared_escrow_authority.key(),
            TsnError::InvalidPrivateEscrowTokenAccount
        );
    }
    if amount > 0 {
        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.pru_token_account.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.pru_authority.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.token_mint.decimals,
        )?;
    }
    if sender_fee_amount > 0 {
        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.pru_token_account.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.treasury_token_account.to_account_info(),
                    authority: ctx.accounts.pru_authority.to_account_info(),
                },
            ),
            sender_fee_amount,
            ctx.accounts.token_mint.decimals,
        )?;
    }
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

    ctx.accounts.pru_spend_guard.mark_nonce_used(nonce);
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.cranker.claim_credits = ctx
        .accounts
        .cranker
        .claim_credits
        .checked_add(1)
        .ok_or(TsnError::CrankerClaimCreditOverflow)?;
    ctx.accounts.cranker.last_active_ts = now;

    emit!(TsnPruSpendExecuted {
        tin,
        pru_index,
        nonce,
        pru_authority: ctx.accounts.pru_authority.key(),
        token_mint: ctx.accounts.token_mint.key(),
        amount,
        commitment_hash,
        epoch_id: mother_escrow.epoch_id,
    });
    Ok(())
}
