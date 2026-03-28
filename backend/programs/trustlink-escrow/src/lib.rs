use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

pub mod error;
pub mod state;

use error::TrustLinkEscrowError;
use state::{
    EscrowConfig, PaymentAccount, PaymentStatus, CONFIG_SEED, PAYMENT_SEED, VAULT_AUTHORITY_SEED,
};

declare_id!("BQCDZF8gFs35xiEUEZbvgkLufMjrcysw5yPdv3MVZohM");

#[program]
pub mod trustlink_escrow {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        claim_verifier: Pubkey,
        treasury_owner: Pubkey,
        default_expiry_seconds: i64,
    ) -> Result<()> {
        require!(
            default_expiry_seconds > 0,
            TrustLinkEscrowError::InvalidDefaultExpiry
        );

        let config = &mut ctx.accounts.config;
        config.claim_verifier = claim_verifier;
        config.treasury_owner = treasury_owner;
        config.default_expiry_seconds = default_expiry_seconds;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_claim_verifier: Pubkey,
        new_treasury_owner: Pubkey,
        new_default_expiry_seconds: i64,
    ) -> Result<()> {
        require!(
            new_default_expiry_seconds > 0,
            TrustLinkEscrowError::InvalidDefaultExpiry
        );
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.config.claim_verifier,
            TrustLinkEscrowError::InvalidConfigAuthority
        );

        let config = &mut ctx.accounts.config;
        config.claim_verifier = new_claim_verifier;
        config.treasury_owner = new_treasury_owner;
        config.default_expiry_seconds = new_default_expiry_seconds;
        Ok(())
    }

    pub fn create_payment(
        ctx: Context<CreatePayment>,
        payment_id: [u8; 32],
        receiver_phone_hash: [u8; 32],
        amount: u64,
        sender_fee_amount: u64,
    ) -> Result<()> {
        require!(amount > 0, TrustLinkEscrowError::InvalidAmount);

        let now = Clock::get()?.unix_timestamp;
        require!(
            ctx.accounts.config.default_expiry_seconds > 0,
            TrustLinkEscrowError::InvalidDefaultExpiry
        );
        require_keys_eq!(
            ctx.accounts.sender_token_account.mint,
            ctx.accounts.token_mint.key(),
            TrustLinkEscrowError::InvalidSenderMint
        );

        token::transfer(ctx.accounts.transfer_to_vault_context(), amount)?;
        if sender_fee_amount > 0 {
            token::transfer(
                ctx.accounts.transfer_sender_fee_to_treasury_context(),
                sender_fee_amount,
            )?;
        }

        let payment = &mut ctx.accounts.payment_account;
        payment.payment_id = payment_id;
        payment.sender_pubkey = ctx.accounts.sender.key();
        payment.receiver_phone_hash = receiver_phone_hash;
        payment.token_mint = ctx.accounts.token_mint.key();
        payment.amount = amount;
        payment.sender_fee_amount = sender_fee_amount;
        payment.claim_fee_amount = 0;
        payment.expiry_ts = now
            .checked_add(ctx.accounts.config.default_expiry_seconds)
            .ok_or(TrustLinkEscrowError::InvalidExpiry)?;
        payment.status = PaymentStatus::Pending;
        payment.payment_bump = ctx.bumps.payment_account;
        payment.vault_authority_bump = ctx.bumps.vault_authority;

        Ok(())
    }

    pub fn claim_payment(
        ctx: Context<ClaimPayment>,
        _payment_id: [u8; 32],
        receiver_phone_hash: [u8; 32],
        claim_fee_amount: u64,
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
        require_keys_eq!(
            ctx.accounts.treasury_token_account.mint,
            payment.token_mint,
            TrustLinkEscrowError::InvalidTreasuryMint
        );
        require!(
            ctx.accounts.escrow_vault.amount >= payment.amount,
            TrustLinkEscrowError::VaultBalanceMismatch
        );

        let payment_amount = payment.amount;
        require!(
            payment_amount > claim_fee_amount,
            TrustLinkEscrowError::InvalidFeeConfig
        );
        let receiver_amount = payment_amount
            .checked_sub(claim_fee_amount)
            .ok_or(TrustLinkEscrowError::InvalidFeeConfig)?;
        let payment_id = payment.payment_id;
        let vault_authority_bump = payment.vault_authority_bump;
        payment.claim_fee_amount = claim_fee_amount;
        let signer_bump = [vault_authority_bump];
        let signer_seeds: &[&[u8]] = &[
            VAULT_AUTHORITY_SEED,
            payment_id.as_ref(),
            &signer_bump,
        ];

        token::transfer(
            ctx.accounts
                .transfer_to_receiver_context()
                .with_signer(&[signer_seeds]),
            receiver_amount,
        )?;
        if claim_fee_amount > 0 {
            token::transfer(
                ctx.accounts
                    .transfer_to_treasury_context()
                    .with_signer(&[signer_seeds]),
                claim_fee_amount,
            )?;
        }
        token::close_account(
            ctx.accounts
                .close_vault_context()
                .with_signer(&[signer_seeds]),
        )?;

        ctx.accounts.payment_account.status = PaymentStatus::Claimed;
        Ok(())
    }

    pub fn expire_payment_to_pool(
        ctx: Context<ExpirePaymentToPool>,
        _payment_id: [u8; 32],
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        let payment = &ctx.accounts.payment_account;
        let payment_status = payment.status;
        let payment_expiry = payment.expiry_ts;
        let payment_token_mint = payment.token_mint;
        let payment_amount = payment.amount;
        let payment_id = payment.payment_id;
        let vault_authority_bump = payment.vault_authority_bump;

        require!(payment_status.is_pending(), TrustLinkEscrowError::PaymentNotPending);
        require!(payment_expiry < now, TrustLinkEscrowError::PaymentNotExpired);
        require_keys_eq!(
            ctx.accounts.claim_verifier.key(),
            ctx.accounts.config.claim_verifier,
            TrustLinkEscrowError::InvalidClaimVerifier
        );
        require_keys_eq!(
            ctx.accounts.recovery_token_account.mint,
            payment_token_mint,
            TrustLinkEscrowError::InvalidRecoveryMint
        );
        require!(
            ctx.accounts.escrow_vault.amount >= payment_amount,
            TrustLinkEscrowError::VaultBalanceMismatch
        );

        let signer_bump = [vault_authority_bump];
        let signer_seeds: &[&[u8]] = &[
            VAULT_AUTHORITY_SEED,
            payment_id.as_ref(),
            &signer_bump,
        ];

        token::transfer(
            ctx.accounts
                .transfer_to_recovery_context()
                .with_signer(&[signer_seeds]),
            payment_amount,
        )?;
        token::close_account(
            ctx.accounts
                .close_vault_context()
                .with_signer(&[signer_seeds]),
        )?;

        let payment = &mut ctx.accounts.payment_account;
        payment.status = PaymentStatus::ExpiredToPool;
        Ok(())
    }

    pub fn refund_payment(ctx: Context<RefundPayment>, _payment_id: [u8; 32]) -> Result<()> {
        let payment = &ctx.accounts.payment_account;
        let now = Clock::get()?.unix_timestamp;

        require!(payment.status.is_pending(), TrustLinkEscrowError::PaymentNotPending);
        require!(payment.expiry_ts >= now, TrustLinkEscrowError::PaymentExpired);
        require_keys_eq!(
            ctx.accounts.claim_verifier.key(),
            ctx.accounts.config.claim_verifier,
            TrustLinkEscrowError::InvalidClaimVerifier
        );
        require_keys_eq!(
            ctx.accounts.sender.key(),
            payment.sender_pubkey,
            TrustLinkEscrowError::Unauthorized
        );
        require!(
            ctx.accounts.escrow_vault.amount >= payment.amount,
            TrustLinkEscrowError::VaultBalanceMismatch
        );

        let payment_amount = payment.amount;
        let payment_id = payment.payment_id;
        let vault_authority_bump = payment.vault_authority_bump;
        let signer_bump = [vault_authority_bump];
        let signer_seeds: &[&[u8]] = &[
            VAULT_AUTHORITY_SEED,
            payment_id.as_ref(),
            &signer_bump,
        ];

        token::transfer(
            ctx.accounts
                .refund_to_sender_context()
                .with_signer(&[signer_seeds]),
            payment_amount,
        )?;
        token::close_account(
            ctx.accounts
                .close_vault_context()
                .with_signer(&[signer_seeds]),
        )?;

        ctx.accounts.payment_account.status = PaymentStatus::Refunded;
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
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, EscrowConfig>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _receiver_phone_hash: [u8; 32], _amount: u64, _sender_fee_amount: u64)]
pub struct CreatePayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(
        mut,
        constraint = sender_token_account.owner == sender.key(),
    )]
    pub sender_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Box<Account<'info, EscrowConfig>>,
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        constraint = treasury_token_account.owner == config.treasury_owner,
        constraint = treasury_token_account.mint == token_mint.key()
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        space = PaymentAccount::SPACE,
        seeds = [PAYMENT_SEED, payment_id.as_ref()],
        bump
    )]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
    /// CHECK: PDA authority only, validated by seeds.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, payment_id.as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        token::mint = token_mint,
        token::authority = vault_authority
    )]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
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

    fn transfer_sender_fee_to_treasury_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
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
#[instruction(payment_id: [u8; 32], _receiver_phone_hash: [u8; 32], _claim_fee_amount: u64)]
pub struct ClaimPayment<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(
        mut,
        close = claim_verifier,
        seeds = [PAYMENT_SEED, payment_id.as_ref()],
        bump = payment_account.payment_bump
    )]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
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
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = receiver_token_account.mint == payment_account.token_mint
    )]
    pub receiver_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = treasury_token_account.owner == config.treasury_owner,
        constraint = treasury_token_account.mint == payment_account.token_mint
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

impl<'info> ClaimPayment<'info> {
    fn transfer_to_receiver_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.escrow_vault.to_account_info(),
                to: self.receiver_token_account.to_account_info(),
                authority: self.vault_authority.to_account_info(),
            },
        )
    }

    fn transfer_to_treasury_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.escrow_vault.to_account_info(),
                to: self.treasury_token_account.to_account_info(),
                authority: self.vault_authority.to_account_info(),
            },
        )
    }

    fn close_vault_context(&self) -> CpiContext<'_, '_, '_, 'info, CloseAccount<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            CloseAccount {
                account: self.escrow_vault.to_account_info(),
                destination: self.claim_verifier.to_account_info(),
                authority: self.vault_authority.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32])]
pub struct ExpirePaymentToPool<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(
        mut,
        close = claim_verifier,
        seeds = [PAYMENT_SEED, payment_id.as_ref()],
        bump = payment_account.payment_bump
    )]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
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
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = recovery_token_account.mint == payment_account.token_mint
    )]
    pub recovery_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

impl<'info> ExpirePaymentToPool<'info> {
    fn transfer_to_recovery_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.escrow_vault.to_account_info(),
                to: self.recovery_token_account.to_account_info(),
                authority: self.vault_authority.to_account_info(),
            },
        )
    }

    fn close_vault_context(&self) -> CpiContext<'_, '_, '_, 'info, CloseAccount<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            CloseAccount {
                account: self.escrow_vault.to_account_info(),
                destination: self.claim_verifier.to_account_info(),
                authority: self.vault_authority.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32])]
pub struct RefundPayment<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Box<Account<'info, EscrowConfig>>,
    pub sender: Signer<'info>,
    #[account(
        mut,
        close = claim_verifier,
        seeds = [PAYMENT_SEED, payment_id.as_ref()],
        bump = payment_account.payment_bump
    )]
    pub payment_account: Box<Account<'info, PaymentAccount>>,
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
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = sender_refund_token_account.owner == sender.key(),
        constraint = sender_refund_token_account.mint == payment_account.token_mint
    )]
    pub sender_refund_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

impl<'info> RefundPayment<'info> {
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

    fn close_vault_context(&self) -> CpiContext<'_, '_, '_, 'info, CloseAccount<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            CloseAccount {
                account: self.escrow_vault.to_account_info(),
                destination: self.claim_verifier.to_account_info(),
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
        assert!(!PaymentStatus::Refunded.is_pending());
    }
}

