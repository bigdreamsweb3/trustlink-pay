use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

pub mod error;
pub mod state;

use error::TrustLinkEscrowError;
use state::{
    EscrowConfig, PaymentAccount, PaymentStatus, CONFIG_SEED, PAYMENT_SEED, VAULT_AUTHORITY_SEED,
};

declare_id!("9f92sFY2VsDTyHCn4r1kmBTVJsMo7b4ZTYByjQNQx3qV");

#[program]
pub mod trustlink_escrow {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        claim_verifier: Pubkey,
        treasury_owner: Pubkey,
        fee_bps: u16,
        fee_cap: u64,
    ) -> Result<()> {
        require!(fee_bps <= 10_000, TrustLinkEscrowError::InvalidFeeConfig);

        let config = &mut ctx.accounts.config;
        config.claim_verifier = claim_verifier;
        config.treasury_owner = treasury_owner;
        config.fee_bps = fee_bps;
        config.fee_cap = fee_cap;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_claim_verifier: Pubkey,
        new_treasury_owner: Pubkey,
        new_fee_bps: u16,
        new_fee_cap: u64,
    ) -> Result<()> {
        require!(new_fee_bps <= 10_000, TrustLinkEscrowError::InvalidFeeConfig);
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.config.claim_verifier,
            TrustLinkEscrowError::InvalidConfigAuthority
        );

        let config = &mut ctx.accounts.config;
        config.claim_verifier = new_claim_verifier;
        config.treasury_owner = new_treasury_owner;
        config.fee_bps = new_fee_bps;
        config.fee_cap = new_fee_cap;
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
        require!(ctx.accounts.config.fee_bps <= 10_000, TrustLinkEscrowError::InvalidFeeConfig);
        require_keys_eq!(
            ctx.accounts.sender_token_account.mint,
            ctx.accounts.token_mint.key(),
            TrustLinkEscrowError::InvalidSenderMint
        );

        token::transfer(ctx.accounts.transfer_to_vault_context(), amount)?;

        let payment = &mut ctx.accounts.payment_account;
        payment.payment_id = payment_id;
        payment.sender_pubkey = ctx.accounts.sender.key();
        payment.receiver_phone_hash = receiver_phone_hash;
        payment.token_mint = ctx.accounts.token_mint.key();
        payment.amount = amount;
        payment.fee_amount = calculate_fee_amount(amount, ctx.accounts.config.fee_bps, ctx.accounts.config.fee_cap)?;
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
        let payment = &ctx.accounts.payment_account;
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
        let fee_amount = payment.fee_amount;
        require!(payment_amount > fee_amount, TrustLinkEscrowError::InvalidFeeConfig);
        let receiver_amount = payment_amount
            .checked_sub(fee_amount)
            .ok_or(TrustLinkEscrowError::InvalidFeeConfig)?;
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
                .transfer_to_receiver_context()
                .with_signer(&[signer_seeds]),
            receiver_amount,
        )?;
        if fee_amount > 0 {
            token::transfer(
                ctx.accounts
                    .transfer_to_treasury_context()
                    .with_signer(&[signer_seeds]),
                fee_amount,
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

    pub fn refund_payment(ctx: Context<RefundPayment>, _payment_id: [u8; 32]) -> Result<()> {
        let payment = &ctx.accounts.payment_account;
        let now = Clock::get()?.unix_timestamp;

        require!(payment.status.is_pending(), TrustLinkEscrowError::PaymentNotPending);
        require!(payment.expiry_ts < now, TrustLinkEscrowError::PaymentNotExpired);
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
#[instruction(payment_id: [u8; 32], _receiver_phone_hash: [u8; 32], _amount: u64, _expiry_ts: i64)]
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
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _receiver_phone_hash: [u8; 32])]
pub struct ClaimPayment<'info> {
    pub claim_verifier: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(
        mut,
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
    #[account(
        mut,
        address = payment_account.sender_pubkey
    )]
    pub sender_main_account: SystemAccount<'info>,
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
                destination: self.sender_main_account.to_account_info(),
                authority: self.vault_authority.to_account_info(),
            },
        )
    }
}

fn calculate_fee_amount(amount: u64, fee_bps: u16, fee_cap: u64) -> Result<u64> {
    let proportional_fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(TrustLinkEscrowError::InvalidFeeConfig)?
        / 10_000u128;
    let fee = proportional_fee.min(fee_cap as u128);
    require!(fee < amount as u128, TrustLinkEscrowError::InvalidFeeConfig);
    Ok(fee as u64)
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32])]
pub struct RefundPayment<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(
        mut,
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
                destination: self.sender.to_account_info(),
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

