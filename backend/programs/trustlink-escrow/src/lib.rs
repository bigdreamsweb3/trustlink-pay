use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

pub mod error;
pub mod state;
pub mod v3;
pub mod v3_state;
pub use v3::{
    AutoClaimEscrowArgs, AutoClaimEscrowV3, ClaimEscrowArgs, ClaimEscrowV3, CreateEscrowArgs, CreateEscrowV3,
};
use v3::{
    __client_accounts_auto_claim_escrow_v3, __client_accounts_claim_escrow_v3, __client_accounts_create_escrow_v3,
};

use error::TrustLinkEscrowError;
use state::{
    EscrowConfig, IdentityBinding, PaymentAccount, PaymentMode, PaymentStatus, CONFIG_SEED,
    IDENTITY_BINDING_SEED, PAYMENT_SEED, VAULT_AUTHORITY_SEED,
};

declare_id!("BQCDZF8gFs35xiEUEZbvgkLufMjrcysw5yPdv3MVZohM");

const RECOVERY_COOLDOWN_SECONDS: i64 = 48 * 60 * 60;

#[program]
pub mod trustlink_escrow {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        claim_verifier: Pubkey,
        default_expiry_seconds: i64,
    ) -> Result<()> {
        require!(default_expiry_seconds > 0, TrustLinkEscrowError::InvalidDefaultExpiry);
        let config = &mut ctx.accounts.config;
        config.claim_verifier = claim_verifier;
        config.default_expiry_seconds = default_expiry_seconds;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_claim_verifier: Pubkey,
        new_default_expiry_seconds: i64,
    ) -> Result<()> {
        require!(new_default_expiry_seconds > 0, TrustLinkEscrowError::InvalidDefaultExpiry);
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.config.claim_verifier,
            TrustLinkEscrowError::InvalidConfigAuthority
        );

        let config = &mut ctx.accounts.config;
        config.claim_verifier = new_claim_verifier;
        config.default_expiry_seconds = new_default_expiry_seconds;
        Ok(())
    }

    pub fn create_escrow_v3(ctx: Context<CreateEscrowV3>, args: CreateEscrowArgs) -> Result<()> {
        v3::create_escrow(ctx, args)
    }

    pub fn claim_v3(ctx: Context<ClaimEscrowV3>, args: ClaimEscrowArgs) -> Result<()> {
        v3::claim(ctx, args)
    }

    pub fn auto_claim_v3(ctx: Context<AutoClaimEscrowV3>, args: AutoClaimEscrowArgs) -> Result<()> {
        v3::auto_claim(ctx, args)
    }

    pub fn create_payment(
        ctx: Context<CreatePayment>,
        payment_id: [u8; 32],
        phone_identity_pubkey: Pubkey,
        payment_receiver_pubkey: Pubkey,
        payment_mode: PaymentMode,
        amount: u64,
        expiry_ts: i64,
    ) -> Result<()> {
        require!(amount > 0, TrustLinkEscrowError::InvalidAmount);
        require_keys_eq!(
            ctx.accounts.sender_token_account.mint,
            ctx.accounts.token_mint.key(),
            TrustLinkEscrowError::InvalidSenderMint
        );

        let now = Clock::get()?.unix_timestamp;
        require!(expiry_ts > now, TrustLinkEscrowError::InvalidExpiry);
        token::transfer(ctx.accounts.transfer_to_vault_context(), amount)?;

        let payment = &mut ctx.accounts.payment_account;
        payment.payment_id = payment_id;
        payment.sender_pubkey = ctx.accounts.sender.key();
        payment.phone_identity_pubkey = phone_identity_pubkey;
        payment.payment_receiver_pubkey = payment_receiver_pubkey;
        payment.token_mint = ctx.accounts.token_mint.key();
        payment.amount = amount;
        payment.expiry_ts = expiry_ts;
        payment.status = PaymentStatus::Locked;
        payment.payment_bump = ctx.bumps.payment_account;
        payment.vault_authority_bump = ctx.bumps.vault_authority;
        payment.sender_phone_identity_pubkey = Pubkey::default();
        payment.payment_mode = payment_mode;
        payment.refund_receiver_pubkey = None;
        payment.refund_requested_at_ts = 0;
        payment.refund_available_at_ts = 0;
        payment.expired_at_ts = 0;
        Ok(())
    }

    pub fn initialize_identity_binding(
        ctx: Context<InitializeIdentityBinding>,
        phone_identity_pubkey: Pubkey,
    ) -> Result<()> {
        require_verifier(&ctx.accounts.claim_verifier, &ctx.accounts.config)?;

        let now = Clock::get()?.unix_timestamp;
        let binding = &mut ctx.accounts.identity_binding;
        binding.phone_identity_pubkey = phone_identity_pubkey;
        binding.settlement_wallet = ctx.accounts.bound_settlement_wallet.key();
        binding.recovery_wallet = None;
        binding.is_frozen = false;
        binding.recovery_cooldown = 0;
        binding.created_at = now;
        binding.updated_at = now;
        binding.bump = ctx.bumps.identity_binding;
        Ok(())
    }

    pub fn claim_and_bind_first_wallet(
        ctx: Context<ClaimAndBindFirstWallet>,
        payment_id: [u8; 32],
        payment_phone_identity_pubkey: Pubkey,
        binding_phone_identity_pubkey: Pubkey,
        payment_receiver_pubkey: Pubkey,
    ) -> Result<()> {
        require_verifier(&ctx.accounts.claim_verifier, &ctx.accounts.config)?;
        let now = Clock::get()?.unix_timestamp;
        let payment = &ctx.accounts.payment_account;
        require!(payment.payment_mode.is_secure(), TrustLinkEscrowError::InvalidPaymentMode);
        require!(payment.status.is_receiver_claimable(), TrustLinkEscrowError::PaymentNotPending);
        require_claim_window(payment.status, payment.expiry_ts, now)?;
        require!(
            payment.phone_identity_pubkey == payment_phone_identity_pubkey
                && payment.payment_receiver_pubkey == payment_receiver_pubkey,
            TrustLinkEscrowError::Unauthorized
        );
        require_keys_eq!(
            ctx.accounts.receiver_authority.key(),
            payment.payment_receiver_pubkey,
            TrustLinkEscrowError::InvalidReceiverAuthority
        );
        require_keys_eq!(
            ctx.accounts.requested_settlement_wallet.key(),
            ctx.accounts.receiver_settlement_wallet.key(),
            TrustLinkEscrowError::InvalidBoundWallet
        );
        require_keys_eq!(
            ctx.accounts.requested_settlement_token_account.owner,
            ctx.accounts.requested_settlement_wallet.key(),
            TrustLinkEscrowError::InvalidBoundWallet
        );
        require_keys_eq!(
            ctx.accounts.requested_settlement_token_account.mint,
            payment.token_mint,
            TrustLinkEscrowError::InvalidReceiverMint
        );
        require!(
            ctx.accounts.escrow_vault.amount >= payment.amount,
            TrustLinkEscrowError::VaultBalanceMismatch
        );

        let binding = &mut ctx.accounts.identity_binding;
        binding.phone_identity_pubkey = binding_phone_identity_pubkey;
        binding.settlement_wallet = ctx.accounts.requested_settlement_wallet.key();
        binding.recovery_wallet = None;
        binding.is_frozen = false;
        binding.recovery_cooldown = 0;
        binding.created_at = now;
        binding.updated_at = now;
        binding.bump = ctx.bumps.identity_binding;

        release_to_destination(
            payment_id,
            payment.amount,
            payment.vault_authority_bump,
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.requested_settlement_token_account.to_account_info(),
            ctx.accounts.claim_verifier.to_account_info(),
            ctx.accounts.vault_authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        )?;

        ctx.accounts.payment_account.status = PaymentStatus::Claimed;
        Ok(())
    }

    pub fn add_recovery_wallet(
        ctx: Context<AddRecoveryWallet>,
        recovery_wallet: Pubkey,
        allow_update: bool,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.identity_binding.settlement_wallet,
            TrustLinkEscrowError::InvalidBoundWallet
        );
        require!(
            recovery_wallet != ctx.accounts.identity_binding.settlement_wallet,
            TrustLinkEscrowError::InvalidRecoveryWallet
        );

        let binding = &mut ctx.accounts.identity_binding;
        require!(
            binding.recovery_wallet.is_none() || allow_update,
            TrustLinkEscrowError::RecoveryAlreadyConfigured
        );
        binding.recovery_wallet = Some(recovery_wallet);
        binding.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn claim_payment(
        ctx: Context<ClaimPayment>,
        payment_id: [u8; 32],
        payment_phone_identity_pubkey: Pubkey,
        payment_receiver_pubkey: Pubkey,
    ) -> Result<()> {
        require_verifier(&ctx.accounts.claim_verifier, &ctx.accounts.config)?;
        let now = Clock::get()?.unix_timestamp;
        let payment = &ctx.accounts.payment_account;
        require!(payment.payment_mode.is_secure(), TrustLinkEscrowError::InvalidPaymentMode);
        require!(payment.status.is_receiver_claimable(), TrustLinkEscrowError::PaymentNotPending);
        require_claim_window(payment.status, payment.expiry_ts, now)?;
        require!(
            payment.phone_identity_pubkey == payment_phone_identity_pubkey
                && payment.payment_receiver_pubkey == payment_receiver_pubkey,
            TrustLinkEscrowError::Unauthorized
        );
        require_keys_eq!(
            ctx.accounts.receiver_authority.key(),
            payment.payment_receiver_pubkey,
            TrustLinkEscrowError::InvalidReceiverAuthority
        );
        require!(!ctx.accounts.identity_binding.is_frozen, TrustLinkEscrowError::IdentityFrozen);
        require_keys_eq!(
            ctx.accounts.receiver_settlement_wallet.key(),
            ctx.accounts.identity_binding.settlement_wallet,
            TrustLinkEscrowError::InvalidBoundWallet
        );
        require_keys_eq!(
            ctx.accounts.settlement_token_account.owner,
            ctx.accounts.identity_binding.settlement_wallet,
            TrustLinkEscrowError::InvalidBoundWallet
        );
        require_keys_eq!(
            ctx.accounts.settlement_token_account.mint,
            payment.token_mint,
            TrustLinkEscrowError::InvalidReceiverMint
        );
        require!(
            ctx.accounts.escrow_vault.amount >= payment.amount,
            TrustLinkEscrowError::VaultBalanceMismatch
        );

        release_to_destination(
            payment_id,
            payment.amount,
            payment.vault_authority_bump,
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.settlement_token_account.to_account_info(),
            ctx.accounts.claim_verifier.to_account_info(),
            ctx.accounts.vault_authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        )?;

        ctx.accounts.payment_account.status = PaymentStatus::Claimed;
        Ok(())
    }

    pub fn claim_invite_and_bind_first_wallet(
        ctx: Context<ClaimInviteAndBindFirstWallet>,
        payment_id: [u8; 32],
        payment_phone_identity_pubkey: Pubkey,
        binding_phone_identity_pubkey: Pubkey,
    ) -> Result<()> {
        require_verifier(&ctx.accounts.claim_verifier, &ctx.accounts.config)?;
        let now = Clock::get()?.unix_timestamp;
        let payment = &ctx.accounts.payment_account;
        require!(payment.payment_mode.is_invite(), TrustLinkEscrowError::InvalidPaymentMode);
        require!(payment.status.is_receiver_claimable(), TrustLinkEscrowError::PaymentNotPending);
        require_claim_window(payment.status, payment.expiry_ts, now)?;
        require!(
            payment.phone_identity_pubkey == payment_phone_identity_pubkey,
            TrustLinkEscrowError::Unauthorized
        );
        require_keys_eq!(
            ctx.accounts.requested_settlement_wallet.key(),
            ctx.accounts.receiver_settlement_wallet.key(),
            TrustLinkEscrowError::InvalidBoundWallet
        );
        require_keys_eq!(
            ctx.accounts.requested_settlement_token_account.owner,
            ctx.accounts.requested_settlement_wallet.key(),
            TrustLinkEscrowError::InvalidBoundWallet
        );
        require_keys_eq!(
            ctx.accounts.requested_settlement_token_account.mint,
            payment.token_mint,
            TrustLinkEscrowError::InvalidReceiverMint
        );
        require!(
            ctx.accounts.escrow_vault.amount >= payment.amount,
            TrustLinkEscrowError::VaultBalanceMismatch
        );

        let binding = &mut ctx.accounts.identity_binding;
        binding.phone_identity_pubkey = binding_phone_identity_pubkey;
        binding.settlement_wallet = ctx.accounts.requested_settlement_wallet.key();
        binding.recovery_wallet = None;
        binding.is_frozen = false;
        binding.recovery_cooldown = 0;
        binding.created_at = now;
        binding.updated_at = now;
        binding.bump = ctx.bumps.identity_binding;

        release_to_destination(
            payment_id,
            payment.amount,
            payment.vault_authority_bump,
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.requested_settlement_token_account.to_account_info(),
            ctx.accounts.claim_verifier.to_account_info(),
            ctx.accounts.vault_authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        )?;

        ctx.accounts.payment_account.status = PaymentStatus::Claimed;
        Ok(())
    }

    pub fn claim_invite_payment(
        ctx: Context<ClaimInvitePayment>,
        payment_id: [u8; 32],
        payment_phone_identity_pubkey: Pubkey,
    ) -> Result<()> {
        require_verifier(&ctx.accounts.claim_verifier, &ctx.accounts.config)?;
        let now = Clock::get()?.unix_timestamp;
        let payment = &ctx.accounts.payment_account;
        require!(payment.payment_mode.is_invite(), TrustLinkEscrowError::InvalidPaymentMode);
        require!(payment.status.is_receiver_claimable(), TrustLinkEscrowError::PaymentNotPending);
        require_claim_window(payment.status, payment.expiry_ts, now)?;
        require!(
            payment.phone_identity_pubkey == payment_phone_identity_pubkey,
            TrustLinkEscrowError::Unauthorized
        );
        require!(!ctx.accounts.identity_binding.is_frozen, TrustLinkEscrowError::IdentityFrozen);
        require_keys_eq!(
            ctx.accounts.receiver_settlement_wallet.key(),
            ctx.accounts.identity_binding.settlement_wallet,
            TrustLinkEscrowError::InvalidBoundWallet
        );
        require_keys_eq!(
            ctx.accounts.settlement_token_account.owner,
            ctx.accounts.identity_binding.settlement_wallet,
            TrustLinkEscrowError::InvalidBoundWallet
        );
        require_keys_eq!(
            ctx.accounts.settlement_token_account.mint,
            payment.token_mint,
            TrustLinkEscrowError::InvalidReceiverMint
        );
        require!(
            ctx.accounts.escrow_vault.amount >= payment.amount,
            TrustLinkEscrowError::VaultBalanceMismatch
        );

        release_to_destination(
            payment_id,
            payment.amount,
            payment.vault_authority_bump,
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.settlement_token_account.to_account_info(),
            ctx.accounts.claim_verifier.to_account_info(),
            ctx.accounts.vault_authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        )?;

        ctx.accounts.payment_account.status = PaymentStatus::Claimed;
        Ok(())
    }

    pub fn mark_expired(
        ctx: Context<MarkExpired>,
        _payment_id: [u8; 32],
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let payment = &mut ctx.accounts.payment_account;
        require!(payment.status.is_locked(), TrustLinkEscrowError::PaymentNotPending);
        require!(payment.expiry_ts < now, TrustLinkEscrowError::PaymentNotExpired);
        payment.expired_at_ts = now;
        payment.status = PaymentStatus::Expired;
        Ok(())
    }

    pub fn refund_expired_payment(
        ctx: Context<RefundExpiredPayment>,
        payment_id: [u8; 32],
    ) -> Result<()> {
        let payment = &ctx.accounts.payment_account;
        require!(payment.status.is_expired(), TrustLinkEscrowError::PaymentNotExpiredState);
        require_keys_eq!(
            ctx.accounts.sender.key(),
            payment.sender_pubkey,
            TrustLinkEscrowError::Unauthorized
        );
        require_keys_eq!(
            ctx.accounts.sender_refund_token_account.owner,
            ctx.accounts.sender.key(),
            TrustLinkEscrowError::InvalidBoundWallet
        );
        require_keys_eq!(
            ctx.accounts.sender_refund_token_account.mint,
            payment.token_mint,
            TrustLinkEscrowError::InvalidReceiverMint
        );
        require!(
            ctx.accounts.escrow_vault.amount >= payment.amount,
            TrustLinkEscrowError::VaultBalanceMismatch
        );

        release_to_destination(
            payment_id,
            payment.amount,
            payment.vault_authority_bump,
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.sender_refund_token_account.to_account_info(),
            ctx.accounts.sender.to_account_info(),
            ctx.accounts.vault_authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        )?;

        ctx.accounts.payment_account.status = PaymentStatus::Refunded;
        Ok(())
    }

    pub fn request_refund(
        _ctx: Context<RequestRefund>,
        _payment_id: [u8; 32],
        _sender_phone_identity_pubkey: Pubkey,
        _refund_receiver_pubkey: Pubkey,
    ) -> Result<()> {
        Err(TrustLinkEscrowError::LegacyDirectRefundDisabled.into())
    }

    pub fn claim_refund(
        _ctx: Context<ClaimRefund>,
        _payment_id: [u8; 32],
    ) -> Result<()> {
        Err(TrustLinkEscrowError::LegacyDirectRefundDisabled.into())
    }

    pub fn claim_refund_and_bind_first_wallet(
        _ctx: Context<ClaimRefundAndBindFirstWallet>,
        _payment_id: [u8; 32],
    ) -> Result<()> {
        Err(TrustLinkEscrowError::LegacyDirectRefundDisabled.into())
    }

    pub fn request_recovery(ctx: Context<RequestRecovery>) -> Result<()> {
        let recovery_wallet = ctx.accounts.identity_binding.recovery_wallet.ok_or(TrustLinkEscrowError::RecoveryNotConfigured)?;
        require_keys_eq!(
            ctx.accounts.authority.key(),
            recovery_wallet,
            TrustLinkEscrowError::InvalidRecoveryWallet
        );

        let now = Clock::get()?.unix_timestamp;
        let binding = &mut ctx.accounts.identity_binding;
        binding.is_frozen = true;
        binding.recovery_cooldown = now + RECOVERY_COOLDOWN_SECONDS;
        binding.updated_at = now;
        Ok(())
    }

    pub fn complete_recovery(ctx: Context<CompleteRecovery>, new_settlement_wallet: Pubkey) -> Result<()> {
        let recovery_wallet = ctx.accounts.identity_binding.recovery_wallet.ok_or(TrustLinkEscrowError::RecoveryNotConfigured)?;
        require_keys_eq!(
            ctx.accounts.authority.key(),
            recovery_wallet,
            TrustLinkEscrowError::InvalidRecoveryWallet
        );

        let now = Clock::get()?.unix_timestamp;
        let binding = &mut ctx.accounts.identity_binding;
        require!(binding.is_frozen, TrustLinkEscrowError::IdentityFrozen);
        require!(
            binding.recovery_cooldown > 0 && now >= binding.recovery_cooldown,
            TrustLinkEscrowError::RecoveryNotReady
        );
        binding.settlement_wallet = new_settlement_wallet;
        binding.recovery_cooldown = 0;
        binding.is_frozen = false;
        binding.updated_at = now;
        Ok(())
    }

    pub fn set_identity_freeze(ctx: Context<SetIdentityFreeze>, frozen: bool) -> Result<()> {
        let authority = ctx.accounts.authority.key();
        let binding = &mut ctx.accounts.identity_binding;
        require!(binding.recovery_wallet.is_some(), TrustLinkEscrowError::RecoveryNotConfigured);
        require!(
            authority == binding.settlement_wallet || Some(authority) == binding.recovery_wallet,
            TrustLinkEscrowError::Unauthorized
        );
        binding.is_frozen = frozen;
        if !frozen {
            binding.recovery_cooldown = 0;
        }
        binding.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn recover_payment(
        _ctx: Context<RecoverPayment>,
        _payment_id: [u8; 32],
        _payment_phone_identity_pubkey: Pubkey,
        _payment_receiver_pubkey: Pubkey,
    ) -> Result<()> {
        Err(TrustLinkEscrowError::LegacyRecoveryClaimDisabled.into())
    }

    pub fn expire_payment_to_pool(_ctx: Context<ExpirePaymentToPool>, _payment_id: [u8; 32]) -> Result<()> {
        Err(TrustLinkEscrowError::LegacySweepDisabled.into())
    }

    pub fn refund_payment(_ctx: Context<RefundPayment>, _payment_id: [u8; 32]) -> Result<()> {
        Err(TrustLinkEscrowError::LegacyDirectRefundDisabled.into())
    }
}

fn require_verifier(claim_verifier: &Signer, config: &Account<EscrowConfig>) -> Result<()> {
    require_keys_eq!(
        claim_verifier.key(),
        config.claim_verifier,
        TrustLinkEscrowError::InvalidClaimVerifier
    );
    Ok(())
}

fn require_claim_window(status: PaymentStatus, expiry_ts: i64, now: i64) -> Result<()> {
    match status {
        PaymentStatus::Locked => require!(expiry_ts >= now, TrustLinkEscrowError::PaymentExpired),
        PaymentStatus::Expired => require!(expiry_ts < now, TrustLinkEscrowError::PaymentNotExpired),
        _ => return err!(TrustLinkEscrowError::PaymentNotPending),
    }

    Ok(())
}

fn release_to_destination<'info>(
    payment_id: [u8; 32],
    amount: u64,
    vault_authority_bump: u8,
    escrow_vault: AccountInfo<'info>,
    destination_token_account: AccountInfo<'info>,
    close_destination: AccountInfo<'info>,
    vault_authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
) -> Result<()> {
    let signer_bump = [vault_authority_bump];
    let signer_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, payment_id.as_ref(), &signer_bump];
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
        amount,
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
#[instruction(payment_id: [u8; 32], _phone_identity_pubkey: Pubkey, _payment_receiver_pubkey: Pubkey, _payment_mode: PaymentMode, _amount: u64, _expiry_ts: i64)]
pub struct CreatePayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(mut, constraint = sender_token_account.owner == sender.key())]
    pub sender_token_account: Box<Account<'info, TokenAccount>>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    pub token_mint: Box<Account<'info, Mint>>,
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
#[instruction(phone_identity_pubkey: Pubkey)]
pub struct InitializeIdentityBinding<'info> {
    #[account(mut)]
    pub claim_verifier: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    /// CHECK: recorded as payout destination authority.
    pub bound_settlement_wallet: UncheckedAccount<'info>,
    #[account(init, payer = claim_verifier, space = IdentityBinding::SPACE, seeds = [IDENTITY_BINDING_SEED, phone_identity_pubkey.as_ref()], bump)]
    pub identity_binding: Box<Account<'info, IdentityBinding>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _payment_phone_identity_pubkey: Pubkey, binding_phone_identity_pubkey: Pubkey, _payment_receiver_pubkey: Pubkey)]
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
    /// CHECK: payout destination owner selected during first bind.
    pub requested_settlement_wallet: UncheckedAccount<'info>,
    #[account(mut, constraint = requested_settlement_token_account.mint == payment_account.token_mint)]
    pub requested_settlement_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _payment_phone_identity_pubkey: Pubkey, _payment_receiver_pubkey: Pubkey)]
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
    #[account(mut, constraint = settlement_token_account.mint == payment_account.token_mint)]
    pub settlement_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _payment_phone_identity_pubkey: Pubkey, binding_phone_identity_pubkey: Pubkey)]
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
    /// CHECK: payout destination owner selected during first invite claim.
    pub requested_settlement_wallet: UncheckedAccount<'info>,
    #[account(mut, constraint = requested_settlement_token_account.mint == payment_account.token_mint)]
    pub requested_settlement_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payment_id: [u8; 32], _payment_phone_identity_pubkey: Pubkey)]
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
    fn payment_status_helpers_match_strict_escrow_states() {
        assert!(PaymentStatus::Locked.is_locked());
        assert!(PaymentStatus::Locked.is_receiver_claimable());
        assert!(PaymentStatus::Expired.is_receiver_claimable());
        assert!(PaymentStatus::Expired.is_expired());
        assert!(PaymentStatus::RefundRequested.is_refund_requested());
        assert!(!PaymentStatus::Created.is_locked());
        assert!(!PaymentStatus::Created.is_receiver_claimable());
        assert!(!PaymentStatus::Claimed.is_receiver_claimable());
        assert!(!PaymentStatus::Refunded.is_refund_requested());
    }
}
