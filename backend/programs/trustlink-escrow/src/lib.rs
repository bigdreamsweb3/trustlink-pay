use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

pub mod error;
pub mod state;

use error::TrustLinkEscrowError;
use state::{
    EscrowConfig, PaymentAccount, PaymentStatus, CONFIG_SEED, PAYMENT_SEED, VAULT_AUTHORITY_SEED,
};

declare_id!("HoqZ2tRMGRTrHDGbPLFZB55bnFpsPMbY4jrJrBv7LWB1");

#[program]
pub mod trustlink_escrow {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, claim_verifier: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.claim_verifier = claim_verifier;
        config.bump = ctx.bumps.config;
        config.initialized_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn create_payment(
        ctx: Context<CreatePayment>,
        payment_id: [u8; 32],
        receiver_phone_hash: [u8; 32],
        amount: u64,
        expiry_ts: i64,
    ) -> Result<()> {
        require!(amount > 0, TrustLinkEscrowError::InvalidAmount);

        let now = Clock::get()?.unix_timestamp;
        require!(expiry_ts > now, TrustLinkEscrowError::InvalidExpiry);
        require_keys_eq!(
            ctx.accounts.sender_token_account.mint,
            ctx.accounts.token_mint.key(),
            TrustLinkEscrowError::InvalidSenderMint
        );

        token::transfer(
            ctx.accounts.transfer_to_vault_context(),
            amount,
        )?;

        let payment = &mut ctx.accounts.payment_account;
        payment.payment_id = payment_id;
        payment.sender_pubkey = ctx.accounts.sender.key();
        payment.receiver_phone_hash = receiver_phone_hash;
        payment.token_mint = ctx.accounts.token_mint.key();
        payment.amount = amount;
        payment.created_at = now;
        payment.expiry_ts = expiry_ts;
        payment.status = PaymentStatus::Pending;
        payment.payment_bump = ctx.bumps.payment_account;
        payment.vault_authority_bump = ctx.bumps.vault_authority;

        Ok(())
    }

    pub fn claim_payment(
        ctx: Context<ClaimPayment>,
        _payment_id: [u8; 32],
        receiver_phone_hash: [u8; 32],
    ) -> Result<()> {
        let payment = &mut ctx.accounts.payment_account;
        let now = Clock::get()?.unix_timestamp;

        require!(payment.status.is_pending(), TrustLinkEscrowError::PaymentNotPending);
        require!(payment.expiry_ts >= now, TrustLinkEscrowError::PaymentExpired);
        require!(
            payment.receiver_phone_hash == receiver_phone_hash,
            TrustLinkEscrowError::Unauthorized
        );
        require_keys_eq!(
            ctx.accounts.claim_verifier.key(),
            ctx.accounts.config.claim_verifier,
            TrustLinkEscrowError::InvalidClaimVerifier
        );
        require_keys_eq!(
            ctx.accounts.receiver_token_account.mint,
            payment.token_mint,
            TrustLinkEscrowError::InvalidReceiverMint
        );
        require!(
            ctx.accounts.escrow_vault.amount >= payment.amount,
            TrustLinkEscrowError::VaultBalanceMismatch
        );

        let payment_id = payment.payment_id;
        let payment_amount = payment.amount;
        let vault_authority_bump = payment.vault_authority_bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            VAULT_AUTHORITY_SEED,
            payment_id.as_ref(),
            &[vault_authority_bump],
        ]];

        token::transfer(
            ctx.accounts
                .transfer_from_vault_context()
                .with_signer(signer_seeds),
            payment_amount,
        )?;

        ctx.accounts.payment_account.status = PaymentStatus::Claimed;

        Ok(())
    }

    pub fn cancel_payment(ctx: Context<CancelPayment>, _payment_id: [u8; 32]) -> Result<()> {
        let payment = &ctx.accounts.payment_account;
        let now = Clock::get()?.unix_timestamp;

        require!(payment.status.is_pending(), TrustLinkEscrowError::PaymentNotPending);
        require_keys_eq!(
            ctx.accounts.sender.key(),
            payment.sender_pubkey,
            TrustLinkEscrowError::Unauthorized
        );
        require!(payment.expiry_ts < now, TrustLinkEscrowError::PaymentNotExpired);

        let payment_id = payment.payment_id;
        let payment_amount = payment.amount;
        let vault_authority_bump = payment.vault_authority_bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            VAULT_AUTHORITY_SEED,
            payment_id.as_ref(),
            &[vault_authority_bump],
        ]];

        token::transfer(
            ctx.accounts
                .refund_to_sender_context()
                .with_signer(signer_seeds),
            payment_amount,
        )?;

        ctx.accounts.payment_account.status = PaymentStatus::Cancelled;

        Ok(())
    }

    pub fn expire_payment(ctx: Context<ExpirePayment>, _payment_id: [u8; 32]) -> Result<()> {
        let payment = &ctx.accounts.payment_account;
        let now = Clock::get()?.unix_timestamp;

        require!(payment.status.is_pending(), TrustLinkEscrowError::PaymentNotPending);
        require!(payment.expiry_ts < now, TrustLinkEscrowError::PaymentNotExpired);

        let payment_id = payment.payment_id;
        let payment_amount = payment.amount;
        let vault_authority_bump = payment.vault_authority_bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            VAULT_AUTHORITY_SEED,
            payment_id.as_ref(),
            &[vault_authority_bump],
        ]];

        token::transfer(
            ctx.accounts
                .refund_to_sender_context()
                .with_signer(signer_seeds),
            payment_amount,
        )?;

        ctx.accounts.payment_account.status = PaymentStatus::Expired;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = EscrowConfig::SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, EscrowConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _receiver_phone_hash: [u8; 32], _amount: u64, _expiry_ts: i64)]
pub struct CreatePayment<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(
        mut,
        constraint = sender_token_account.owner == sender.key(),
    )]
    pub sender_token_account: Account<'info, TokenAccount>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = sender,
        space = PaymentAccount::SPACE,
        seeds = [PAYMENT_SEED, payment_id.as_ref()],
        bump
    )]
    pub payment_account: Account<'info, PaymentAccount>,
    /// CHECK: PDA authority only, validated by seeds.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = sender,
        token::mint = token_mint,
        token::authority = vault_authority
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> CreatePayment<'info> {
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
#[instruction(payment_id: [u8; 32], _receiver_phone_hash: [u8; 32])]
pub struct ClaimPayment<'info> {
    pub claim_verifier: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, EscrowConfig>,
    #[account(
        mut,
        seeds = [PAYMENT_SEED, payment_id.as_ref()],
        bump = payment_account.payment_bump
    )]
    pub payment_account: Account<'info, PaymentAccount>,
    /// CHECK: PDA authority only, validated by seeds.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()],
        bump = payment_account.vault_authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = escrow_vault.owner == vault_authority.key(),
        constraint = escrow_vault.mint == payment_account.token_mint
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = receiver_token_account.mint == payment_account.token_mint
    )]
    pub receiver_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

impl<'info> ClaimPayment<'info> {
    fn transfer_from_vault_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.escrow_vault.to_account_info(),
                to: self.receiver_token_account.to_account_info(),
                authority: self.vault_authority.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32])]
pub struct CancelPayment<'info> {
    pub sender: Signer<'info>,
    #[account(
        mut,
        seeds = [PAYMENT_SEED, payment_id.as_ref()],
        bump = payment_account.payment_bump
    )]
    pub payment_account: Account<'info, PaymentAccount>,
    /// CHECK: PDA authority only, validated by seeds.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()],
        bump = payment_account.vault_authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = escrow_vault.owner == vault_authority.key(),
        constraint = escrow_vault.mint == payment_account.token_mint
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = sender_refund_token_account.owner == sender.key(),
        constraint = sender_refund_token_account.mint == payment_account.token_mint
    )]
    pub sender_refund_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

impl<'info> CancelPayment<'info> {
    fn refund_to_sender_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.escrow_vault.to_account_info(),
                to: self.sender_refund_token_account.to_account_info(),
                authority: self.vault_authority.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32])]
pub struct ExpirePayment<'info> {
    #[account(
        mut,
        seeds = [PAYMENT_SEED, payment_id.as_ref()],
        bump = payment_account.payment_bump
    )]
    pub payment_account: Account<'info, PaymentAccount>,
    /// CHECK: PDA authority only, validated by seeds.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()],
        bump = payment_account.vault_authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = escrow_vault.owner == vault_authority.key(),
        constraint = escrow_vault.mint == payment_account.token_mint
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = sender_refund_token_account.owner == payment_account.sender_pubkey,
        constraint = sender_refund_token_account.mint == payment_account.token_mint
    )]
    pub sender_refund_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

impl<'info> ExpirePayment<'info> {
    fn refund_to_sender_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.escrow_vault.to_account_info(),
                to: self.sender_refund_token_account.to_account_info(),
                authority: self.vault_authority.to_account_info(),
            },
        )
    }
}

#[cfg(test)]
mod unit_tests {
    use super::*;

    #[test]
    fn payment_status_pending_helper() {
        assert!(PaymentStatus::Pending.is_pending());
        assert!(!PaymentStatus::Claimed.is_pending());
        assert!(!PaymentStatus::Cancelled.is_pending());
        assert!(!PaymentStatus::Expired.is_pending());
    }
}
