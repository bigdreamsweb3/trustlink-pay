use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer};

use crate::error::TrustLinkEscrowError;
use crate::state::{
    EscrowConfig, IdentityBinding, PaymentAccount, PaymentMode, CONFIG_SEED, IDENTITY_BINDING_SEED,
    PAYMENT_SEED, VAULT_AUTHORITY_SEED,
};
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = EscrowConfig::SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, EscrowConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, EscrowConfig>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _phone_identity_pubkey: Pubkey, _payment_receiver_pubkey: Pubkey, _payment_mode: PaymentMode, _amount: u64, _sender_fee_amount: u64, _expiry_ts: i64)]
pub struct CreatePayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(mut, constraint = sender_token_account.owner == sender.key())]
    pub sender_token_account: Box<Account<'info, TokenAccount>>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(constraint = token_mint.key() == payment_account.token_mint @ TrustLinkEscrowError::InvalidReceiverMint)]
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        constraint = treasury_token_account.owner == config.treasury_owner @ TrustLinkEscrowError::InvalidTreasuryTokenAccount,
        constraint = treasury_token_account.mint == token_mint.key() @ TrustLinkEscrowError::InvalidTreasuryTokenAccount
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = payer, space = PaymentAccount::SPACE, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(init, payer = payer, token::mint = token_mint, token::authority = vault_authority)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> CreatePayment<'info> {
    pub(crate) fn transfer_to_vault_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.sender_token_account.to_account_info(),
                to: self.escrow_vault.to_account_info(),
                authority: self.sender.to_account_info(),
            },
        )
    }

    pub(crate) fn transfer_sender_fee_to_treasury_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.sender_token_account.to_account_info(),
                to: self.treasury_token_account.to_account_info(),
                authority: self.sender.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
#[instruction(phone_identity_pubkey: Pubkey)]
pub struct InitializeIdentityBinding<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    pub bound_settlement_wallet: Signer<'info>,
    #[account(init, payer = claim_verifier, space = IdentityBinding::SPACE, seeds = [IDENTITY_BINDING_SEED, phone_identity_pubkey.as_ref()], bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _payment_phone_identity_pubkey: Pubkey, binding_phone_identity_pubkey: Pubkey, _payment_receiver_pubkey: Pubkey, _claim_fee_amount: u64)]
pub struct ClaimAndBindFirstWallet<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    pub receiver_authority: Signer<'info>,
    pub receiver_settlement_wallet: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(mut, close = claim_verifier, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump = payment_account.payment_bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
    #[account(init, payer = claim_verifier, space = IdentityBinding::SPACE, seeds = [IDENTITY_BINDING_SEED, binding_phone_identity_pubkey.as_ref()], bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()], bump = payment_account.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = escrow_vault.owner == vault_authority.key(), constraint = escrow_vault.mint == payment_account.token_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(constraint = token_mint.key() == payment_account.token_mint @ TrustLinkEscrowError::InvalidReceiverMint)]
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        constraint = treasury_token_account.owner == config.treasury_owner @ TrustLinkEscrowError::InvalidTreasuryTokenAccount,
        constraint = treasury_token_account.mint == payment_account.token_mint @ TrustLinkEscrowError::InvalidTreasuryTokenAccount
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: payout destination owner selected during first bind.
    pub requested_settlement_wallet: UncheckedAccount<'info>,
    #[account(mut, constraint = requested_settlement_token_account.mint == payment_account.token_mint)]
    pub requested_settlement_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _payment_phone_identity_pubkey: Pubkey, _payment_receiver_pubkey: Pubkey, _claim_fee_amount: u64)]
pub struct ClaimPayment<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    pub receiver_authority: Signer<'info>,
    pub receiver_settlement_wallet: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(mut, close = claim_verifier, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump = payment_account.payment_bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
    #[account(seeds = [IDENTITY_BINDING_SEED, identity_binding.phone_identity_pubkey.as_ref()], bump = identity_binding.bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()], bump = payment_account.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = escrow_vault.owner == vault_authority.key(), constraint = escrow_vault.mint == payment_account.token_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(constraint = token_mint.key() == payment_account.token_mint @ TrustLinkEscrowError::InvalidReceiverMint)]
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        constraint = treasury_token_account.owner == config.treasury_owner @ TrustLinkEscrowError::InvalidTreasuryTokenAccount,
        constraint = treasury_token_account.mint == payment_account.token_mint @ TrustLinkEscrowError::InvalidTreasuryTokenAccount
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = settlement_token_account.mint == payment_account.token_mint)]
    pub settlement_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _payment_phone_identity_pubkey: Pubkey, binding_phone_identity_pubkey: Pubkey, _claim_fee_amount: u64)]
pub struct ClaimInviteAndBindFirstWallet<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    pub receiver_settlement_wallet: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(mut, close = claim_verifier, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump = payment_account.payment_bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
    #[account(init, payer = claim_verifier, space = IdentityBinding::SPACE, seeds = [IDENTITY_BINDING_SEED, binding_phone_identity_pubkey.as_ref()], bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()], bump = payment_account.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = escrow_vault.owner == vault_authority.key(), constraint = escrow_vault.mint == payment_account.token_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(constraint = token_mint.key() == payment_account.token_mint @ TrustLinkEscrowError::InvalidReceiverMint)]
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        constraint = treasury_token_account.owner == config.treasury_owner @ TrustLinkEscrowError::InvalidTreasuryTokenAccount,
        constraint = treasury_token_account.mint == payment_account.token_mint @ TrustLinkEscrowError::InvalidTreasuryTokenAccount
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: payout destination owner selected during first invite claim.
    pub requested_settlement_wallet: UncheckedAccount<'info>,
    #[account(mut, constraint = requested_settlement_token_account.mint == payment_account.token_mint)]
    pub requested_settlement_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _payment_phone_identity_pubkey: Pubkey, _claim_fee_amount: u64)]
pub struct ClaimInvitePayment<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    pub receiver_settlement_wallet: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(mut, close = claim_verifier, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump = payment_account.payment_bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
    #[account(seeds = [IDENTITY_BINDING_SEED, identity_binding.phone_identity_pubkey.as_ref()], bump = identity_binding.bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()], bump = payment_account.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = escrow_vault.owner == vault_authority.key(), constraint = escrow_vault.mint == payment_account.token_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        constraint = treasury_token_account.owner == config.treasury_owner @ TrustLinkEscrowError::InvalidTreasuryTokenAccount,
        constraint = treasury_token_account.mint == payment_account.token_mint @ TrustLinkEscrowError::InvalidTreasuryTokenAccount
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = settlement_token_account.mint == payment_account.token_mint)]
    pub settlement_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32])]
pub struct MarkExpired<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(mut, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump = payment_account.payment_bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _sender_phone_identity_pubkey: Pubkey, _refund_receiver_pubkey: Pubkey)]
pub struct RequestRefund<'info> {
    pub sender: Signer<'info>,
    #[account(mut, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump = payment_account.payment_bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32])]
pub struct RefundExpiredPayment<'info> {
    pub sender: Signer<'info>,
    #[account(mut, close = sender, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump = payment_account.payment_bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()], bump = payment_account.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = escrow_vault.owner == vault_authority.key(), constraint = escrow_vault.mint == payment_account.token_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = sender_refund_token_account.owner == sender.key(), constraint = sender_refund_token_account.mint == payment_account.token_mint)]
    pub sender_refund_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32])]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    pub refund_receiver_authority: Signer<'info>,
    pub sender_settlement_wallet: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(mut, close = claim_verifier, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump = payment_account.payment_bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
    #[account(seeds = [IDENTITY_BINDING_SEED, payment_account.sender_phone_identity_pubkey.as_ref()], bump = identity_binding.bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()], bump = payment_account.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = escrow_vault.owner == vault_authority.key(), constraint = escrow_vault.mint == payment_account.token_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = settlement_token_account.mint == payment_account.token_mint)]
    pub settlement_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32])]
pub struct ClaimRefundAndBindFirstWallet<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    pub refund_receiver_authority: Signer<'info>,
    pub sender_settlement_wallet: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(mut, close = claim_verifier, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump = payment_account.payment_bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
    #[account(init, payer = claim_verifier, space = IdentityBinding::SPACE, seeds = [IDENTITY_BINDING_SEED, payment_account.sender_phone_identity_pubkey.as_ref()], bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()], bump = payment_account.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = escrow_vault.owner == vault_authority.key(), constraint = escrow_vault.mint == payment_account.token_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: payout destination owner selected during first refund claim.
    pub requested_settlement_wallet: UncheckedAccount<'info>,
    #[account(mut, constraint = requested_settlement_token_account.mint == payment_account.token_mint)]
    pub requested_settlement_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestRecovery<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [IDENTITY_BINDING_SEED, identity_binding.phone_identity_pubkey.as_ref()], bump = identity_binding.bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
}

#[derive(Accounts)]
pub struct CompleteRecovery<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [IDENTITY_BINDING_SEED, identity_binding.phone_identity_pubkey.as_ref()], bump = identity_binding.bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
}

#[derive(Accounts)]
pub struct SetIdentityFreeze<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [IDENTITY_BINDING_SEED, identity_binding.phone_identity_pubkey.as_ref()], bump = identity_binding.bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
}

#[derive(Accounts)]
pub struct AddRecoveryWallet<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [IDENTITY_BINDING_SEED, identity_binding.phone_identity_pubkey.as_ref()], bump = identity_binding.bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _payment_phone_identity_pubkey: Pubkey, _payment_receiver_pubkey: Pubkey)]
pub struct RecoverPayment<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    pub recovery_authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(mut, close = claim_verifier, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump = payment_account.payment_bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
    #[account(seeds = [IDENTITY_BINDING_SEED, identity_binding.phone_identity_pubkey.as_ref()], bump = identity_binding.bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()], bump = payment_account.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = escrow_vault.owner == vault_authority.key(), constraint = escrow_vault.mint == payment_account.token_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = recovery_token_account.mint == payment_account.token_mint)]
    pub recovery_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32])]
pub struct ExpirePaymentToPool<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(mut, close = claim_verifier, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump = payment_account.payment_bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()], bump = payment_account.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = escrow_vault.owner == vault_authority.key(), constraint = escrow_vault.mint == payment_account.token_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = recovery_token_account.mint == payment_account.token_mint)]
    pub recovery_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32])]
pub struct RefundPayment<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    pub sender: Signer<'info>,
    #[account(mut, close = claim_verifier, seeds = [PAYMENT_SEED, payment_id.as_ref()], bump = payment_account.payment_bump)]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()], bump = payment_account.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = escrow_vault.owner == vault_authority.key(), constraint = escrow_vault.mint == payment_account.token_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = sender_refund_token_account.owner == sender.key(), constraint = sender_refund_token_account.mint == payment_account.token_mint)]
    pub sender_refund_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

