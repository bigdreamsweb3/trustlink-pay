use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::hash::hashv;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as SYSVAR_INSTRUCTIONS_ID,
};
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

use crate::error::TrustLinkEscrowError;
use crate::v3_state::{
    ConsumedNonceV3, EscrowV3, EscrowV3State, ESCROW_V3_NONCE_SEED, ESCROW_V3_SEED,
    ESCROW_V3_VAULT_AUTHORITY_SEED,
};

const DERIVATION_DOMAIN: &[u8] = b"TLP_DERIVE_V1";
const CLAIM_DOMAIN: &[u8] = b"TLP_CLAIM_V1";

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateEscrowArgs {
    pub recipient_child_hash: [u8; 32],
    pub master_registry_pubkey: Pubkey,
    pub nonce: u64,
    pub expiry_ts: i64,
    pub auto_claim_dest_hash: [u8; 32],
    pub derivation_proof_sig: [u8; 64],
    pub amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ClaimEscrowArgs {
    pub child_pubkey: Pubkey,
    pub destination_pubkey: Pubkey,
    pub derivation_proof_sig: [u8; 64],
    pub child_sig: [u8; 64],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AutoClaimEscrowArgs {
    pub child_pubkey: Pubkey,
    pub destination_pubkey: Pubkey,
    pub derivation_proof_sig: [u8; 64],
}

pub fn create_escrow(ctx: Context<CreateEscrowV3>, args: CreateEscrowArgs) -> Result<()> {
    require!(args.amount > 0, TrustLinkEscrowError::InvalidAmount);
    require_keys_eq!(
        ctx.accounts.sender_token_account.mint,
        ctx.accounts.token_mint.key(),
        TrustLinkEscrowError::InvalidSenderMint
    );

    let now = Clock::get()?.unix_timestamp;
    require!(args.expiry_ts > now, TrustLinkEscrowError::InvalidExpiry);

    token::transfer(ctx.accounts.transfer_to_vault_context(), args.amount)?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.sender = ctx.accounts.sender.key();
    escrow.master_registry_pubkey = args.master_registry_pubkey;
    escrow.recipient_child_hash = args.recipient_child_hash;
    escrow.amount = args.amount;
    escrow.token_mint = ctx.accounts.token_mint.key();
    escrow.nonce = args.nonce;
    escrow.expiry_ts = args.expiry_ts;
    escrow.auto_claim_dest_hash = args.auto_claim_dest_hash;
    escrow.derivation_proof_sig = args.derivation_proof_sig;
    escrow.state = EscrowV3State::Held;
    escrow.bump = ctx.bumps.escrow;
    escrow.vault_authority_bump = ctx.bumps.vault_authority;
    Ok(())
}

pub fn claim(ctx: Context<ClaimEscrowV3>, args: ClaimEscrowArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let escrow = &ctx.accounts.escrow;
    require!(escrow.state.is_held(), TrustLinkEscrowError::EscrowAlreadyClaimed);
    require!(now <= escrow.expiry_ts, TrustLinkEscrowError::ExpiredEscrow);

    let child_hash = hashv(&[args.child_pubkey.as_ref()]).to_bytes();
    require!(
        child_hash == escrow.recipient_child_hash,
        TrustLinkEscrowError::InvalidChildPublicKey
    );

    let derivation_message = derivation_message(
        &args.child_pubkey,
        &ctx.accounts.escrow.key(),
        escrow.nonce,
        escrow.expiry_ts,
        &args.destination_pubkey,
    );
    require!(
        escrow.derivation_proof_sig == args.derivation_proof_sig,
        TrustLinkEscrowError::InvalidDerivationProof
    );
    verify_ed25519_ix(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        0,
        &escrow.master_registry_pubkey,
        &args.derivation_proof_sig,
        &derivation_message,
    )?;

    let claim_message = claim_message(&ctx.accounts.escrow.key(), escrow.nonce, escrow.expiry_ts, &args.destination_pubkey);
    verify_ed25519_ix(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        1,
        &args.child_pubkey,
        &args.child_sig,
        &claim_message,
    )?;

    release_escrow(
        &ctx.accounts.escrow,
        ctx.accounts.escrow_vault.to_account_info(),
        ctx.accounts.destination_token_account.to_account_info(),
        ctx.accounts.executor.to_account_info(),
        ctx.accounts.vault_authority.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
    )?;

    let nonce_account = &mut ctx.accounts.consumed_nonce;
    nonce_account.master_registry_pubkey = escrow.master_registry_pubkey;
    nonce_account.escrow = ctx.accounts.escrow.key();
    nonce_account.nonce = escrow.nonce;
    nonce_account.consumed_at = now;
    nonce_account.bump = ctx.bumps.consumed_nonce;

    ctx.accounts.escrow.state = EscrowV3State::Claimed;
    Ok(())
}

pub fn auto_claim(ctx: Context<AutoClaimEscrowV3>, args: AutoClaimEscrowArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let escrow = &ctx.accounts.escrow;
    require!(escrow.state.is_held(), TrustLinkEscrowError::EscrowAlreadyClaimed);
    require!(now >= escrow.expiry_ts, TrustLinkEscrowError::AutoClaimNotReady);

    let child_hash = hashv(&[args.child_pubkey.as_ref()]).to_bytes();
    require!(
        child_hash == escrow.recipient_child_hash,
        TrustLinkEscrowError::InvalidChildPublicKey
    );

    let destination_hash = hashv(&[args.destination_pubkey.as_ref()]).to_bytes();
    require!(
        destination_hash == escrow.auto_claim_dest_hash,
        TrustLinkEscrowError::DestinationMismatch
    );

    let derivation_message = derivation_message(
        &args.child_pubkey,
        &ctx.accounts.escrow.key(),
        escrow.nonce,
        escrow.expiry_ts,
        &args.destination_pubkey,
    );
    require!(
        escrow.derivation_proof_sig == args.derivation_proof_sig,
        TrustLinkEscrowError::InvalidDerivationProof
    );
    verify_ed25519_ix(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        0,
        &escrow.master_registry_pubkey,
        &args.derivation_proof_sig,
        &derivation_message,
    )?;

    release_escrow(
        &ctx.accounts.escrow,
        ctx.accounts.escrow_vault.to_account_info(),
        ctx.accounts.destination_token_account.to_account_info(),
        ctx.accounts.executor.to_account_info(),
        ctx.accounts.vault_authority.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
    )?;

    let nonce_account = &mut ctx.accounts.consumed_nonce;
    nonce_account.master_registry_pubkey = escrow.master_registry_pubkey;
    nonce_account.escrow = ctx.accounts.escrow.key();
    nonce_account.nonce = escrow.nonce;
    nonce_account.consumed_at = now;
    nonce_account.bump = ctx.bumps.consumed_nonce;

    ctx.accounts.escrow.state = EscrowV3State::Claimed;
    Ok(())
}

fn derivation_message(
    child_pubkey: &Pubkey,
    escrow_pubkey: &Pubkey,
    nonce: u64,
    expiry_ts: i64,
    destination_pubkey: &Pubkey,
) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(8 + 32 + 32 + 8 + 8 + 32);
    bytes.extend_from_slice(DERIVATION_DOMAIN);
    bytes.extend_from_slice(child_pubkey.as_ref());
    bytes.extend_from_slice(escrow_pubkey.as_ref());
    bytes.extend_from_slice(&nonce.to_le_bytes());
    bytes.extend_from_slice(&expiry_ts.to_le_bytes());
    bytes.extend_from_slice(destination_pubkey.as_ref());
    bytes
}

fn claim_message(
    escrow_pubkey: &Pubkey,
    nonce: u64,
    expiry_ts: i64,
    destination_pubkey: &Pubkey,
) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(8 + 32 + 8 + 8 + 32);
    bytes.extend_from_slice(CLAIM_DOMAIN);
    bytes.extend_from_slice(escrow_pubkey.as_ref());
    bytes.extend_from_slice(&nonce.to_le_bytes());
    bytes.extend_from_slice(&expiry_ts.to_le_bytes());
    bytes.extend_from_slice(destination_pubkey.as_ref());
    bytes
}

fn release_escrow<'info>(
    escrow: &Account<'info, EscrowV3>,
    escrow_vault: AccountInfo<'info>,
    destination_token_account: AccountInfo<'info>,
    close_destination: AccountInfo<'info>,
    vault_authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
) -> Result<()> {
    let signer_bump = [escrow.vault_authority_bump];
    let nonce_bytes = escrow.nonce.to_le_bytes();
    let signer_seeds: &[&[u8]] = &[
        ESCROW_V3_VAULT_AUTHORITY_SEED,
        escrow.recipient_child_hash.as_ref(),
        nonce_bytes.as_ref(),
        escrow.token_mint.as_ref(),
        &signer_bump,
    ];

    token::transfer(
        CpiContext::new(
            token_program.clone(),
            Transfer {
                from: escrow_vault.clone(),
                to: destination_token_account,
                authority: vault_authority.clone(),
            },
        )
        .with_signer(&[signer_seeds]),
        escrow.amount,
    )?;

    token::close_account(
        CpiContext::new(
            token_program,
            CloseAccount {
                account: escrow_vault,
                destination: close_destination,
                authority: vault_authority,
            },
        )
        .with_signer(&[signer_seeds]),
    )?;

    Ok(())
}

fn verify_ed25519_ix(
    instructions_sysvar: &AccountInfo,
    offset_from_current: usize,
    pubkey: &Pubkey,
    signature: &[u8; 64],
    message: &[u8],
) -> Result<()> {
    let current = load_current_index_checked(instructions_sysvar)? as usize;
    require!(
        current >= offset_from_current + 1,
        TrustLinkEscrowError::MissingSignatureVerification
    );
    let ix = load_instruction_at_checked(current - (offset_from_current + 1), instructions_sysvar)?;
    require!(ed25519_program::check_id(&ix.program_id), TrustLinkEscrowError::MissingSignatureVerification);
    require!(ix.accounts.is_empty(), TrustLinkEscrowError::InvalidSignatureVerificationInstruction);

    let data = ix.data;
    require!(data.len() >= 16, TrustLinkEscrowError::InvalidSignatureVerificationInstruction);
    require!(data[0] == 1, TrustLinkEscrowError::InvalidSignatureVerificationInstruction);

    let signature_offset = u16::from_le_bytes([data[2], data[3]]) as usize;
    let signature_instruction_index = u16::from_le_bytes([data[4], data[5]]);
    let public_key_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let public_key_instruction_index = u16::from_le_bytes([data[8], data[9]]);
    let message_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_size = u16::from_le_bytes([data[12], data[13]]) as usize;
    let message_instruction_index = u16::from_le_bytes([data[14], data[15]]);

    require!(
        signature_instruction_index == u16::MAX
            && public_key_instruction_index == u16::MAX
            && message_instruction_index == u16::MAX,
        TrustLinkEscrowError::InvalidSignatureVerificationInstruction
    );
    require!(
        data.len() >= signature_offset + 64
            && data.len() >= public_key_offset + 32
            && data.len() >= message_offset + message_size,
        TrustLinkEscrowError::InvalidSignatureVerificationInstruction
    );
    require!(
        &data[signature_offset..signature_offset + 64] == signature,
        TrustLinkEscrowError::InvalidSignatureVerificationInstruction
    );
    require!(
        data[public_key_offset..public_key_offset + 32] == pubkey.to_bytes(),
        TrustLinkEscrowError::InvalidSignatureVerificationInstruction
    );
    require!(
        &data[message_offset..message_offset + message_size] == message,
        TrustLinkEscrowError::InvalidSignatureVerificationInstruction
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: CreateEscrowArgs)]
pub struct CreateEscrowV3<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(mut, constraint = sender_token_account.owner == sender.key())]
    pub sender_token_account: Box<Account<'info, TokenAccount>>,
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = payer,
        space = EscrowV3::SPACE,
        seeds = [
            ESCROW_V3_SEED,
            args.recipient_child_hash.as_ref(),
            args.nonce.to_le_bytes().as_ref(),
            token_mint.key().as_ref()
        ],
        bump
    )]
    pub escrow: Box<Account<'info, EscrowV3>>,
    /// CHECK: PDA authority only.
    #[account(
        seeds = [
            ESCROW_V3_VAULT_AUTHORITY_SEED,
            args.recipient_child_hash.as_ref(),
            args.nonce.to_le_bytes().as_ref(),
            token_mint.key().as_ref()
        ],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(init, payer = payer, token::mint = token_mint, token::authority = vault_authority)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> CreateEscrowV3<'info> {
    fn transfer_to_vault_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.sender_token_account.to_account_info(),
                to: self.escrow_vault.to_account_info(),
                authority: self.sender.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct ClaimEscrowV3<'info> {
    #[account(mut)]
    pub executor: Signer<'info>,
    #[account(mut, close = executor)]
    pub escrow: Box<Account<'info, EscrowV3>>,
    #[account(
        init,
        payer = executor,
        space = ConsumedNonceV3::SPACE,
        seeds = [
            ESCROW_V3_NONCE_SEED,
            escrow.master_registry_pubkey.as_ref(),
            escrow.nonce.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub consumed_nonce: Box<Account<'info, ConsumedNonceV3>>,
    /// CHECK: PDA authority only.
    #[account(
        seeds = [
            ESCROW_V3_VAULT_AUTHORITY_SEED,
            escrow.recipient_child_hash.as_ref(),
            escrow.nonce.to_le_bytes().as_ref(),
            escrow.token_mint.as_ref()
        ],
        bump = escrow.vault_authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = escrow_vault.owner == vault_authority.key(), constraint = escrow_vault.mint == escrow.token_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = destination_token_account.mint == escrow.token_mint)]
    pub destination_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: checked against the sysvar instructions ID.
    #[account(address = SYSVAR_INSTRUCTIONS_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AutoClaimEscrowV3<'info> {
    #[account(mut)]
    pub executor: Signer<'info>,
    #[account(mut, close = executor)]
    pub escrow: Box<Account<'info, EscrowV3>>,
    #[account(
        init,
        payer = executor,
        space = ConsumedNonceV3::SPACE,
        seeds = [
            ESCROW_V3_NONCE_SEED,
            escrow.master_registry_pubkey.as_ref(),
            escrow.nonce.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub consumed_nonce: Box<Account<'info, ConsumedNonceV3>>,
    /// CHECK: PDA authority only.
    #[account(
        seeds = [
            ESCROW_V3_VAULT_AUTHORITY_SEED,
            escrow.recipient_child_hash.as_ref(),
            escrow.nonce.to_le_bytes().as_ref(),
            escrow.token_mint.as_ref()
        ],
        bump = escrow.vault_authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = escrow_vault.owner == vault_authority.key(), constraint = escrow_vault.mint == escrow.token_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = destination_token_account.mint == escrow.token_mint)]
    pub destination_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: checked against the sysvar instructions ID.
    #[account(address = SYSVAR_INSTRUCTIONS_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
