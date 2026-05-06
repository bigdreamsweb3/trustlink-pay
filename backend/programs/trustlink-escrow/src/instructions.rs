use anchor_lang::prelude::*;
use anchor_spl::token;

use crate::contexts::*;
use crate::error::TrustLinkEscrowError;
use crate::helpers::{calculate_fee_amount, release_to_destination, require_claim_window, require_fee_config, require_verifier};
use crate::state::{PaymentMode, PaymentStatus};

const RECOVERY_COOLDOWN_SECONDS: i64 = 48 * 60 * 60;
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        claim_verifier: Pubkey,
        treasury_owner: Pubkey,
        send_fee_bps: u16,
        send_fee_max_ui_micros: u64,
        claim_fee_bps: u16,
        claim_fee_max_ui_micros: u64,
        default_expiry_seconds: i64,
    ) -> Result<()> {
        require!(default_expiry_seconds > 0, TrustLinkEscrowError::InvalidDefaultExpiry);
        require_fee_config(send_fee_bps, send_fee_max_ui_micros)?;
        require_fee_config(claim_fee_bps, claim_fee_max_ui_micros)?;
        let config = &mut ctx.accounts.config;
        config.claim_verifier = claim_verifier;
        config.treasury_owner = treasury_owner;
        config.send_fee_bps = send_fee_bps;
        config.claim_fee_bps = claim_fee_bps;
        config.send_fee_max_ui_micros = send_fee_max_ui_micros;
        config.claim_fee_max_ui_micros = claim_fee_max_ui_micros;
        config.default_expiry_seconds = default_expiry_seconds;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_claim_verifier: Pubkey,
        new_treasury_owner: Pubkey,
        new_send_fee_bps: u16,
        new_send_fee_max_ui_micros: u64,
        new_claim_fee_bps: u16,
        new_claim_fee_max_ui_micros: u64,
        new_default_expiry_seconds: i64,
    ) -> Result<()> {
        require!(new_default_expiry_seconds > 0, TrustLinkEscrowError::InvalidDefaultExpiry);
        require_fee_config(new_send_fee_bps, new_send_fee_max_ui_micros)?;
        require_fee_config(new_claim_fee_bps, new_claim_fee_max_ui_micros)?;
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.config.claim_verifier,
            TrustLinkEscrowError::InvalidConfigAuthority
        );

        let config = &mut ctx.accounts.config;
        config.claim_verifier = new_claim_verifier;
        config.treasury_owner = new_treasury_owner;
        config.send_fee_bps = new_send_fee_bps;
        config.claim_fee_bps = new_claim_fee_bps;
        config.send_fee_max_ui_micros = new_send_fee_max_ui_micros;
        config.claim_fee_max_ui_micros = new_claim_fee_max_ui_micros;
        config.default_expiry_seconds = new_default_expiry_seconds;
        Ok(())
    }

    pub fn create_payment(
        ctx: Context<CreatePayment>,
        payment_id: [u8; 32],
        phone_identity_pubkey: Pubkey,
        payment_receiver_pubkey: Pubkey,
        payment_mode: PaymentMode,
        amount: u64,
        sender_fee_amount: u64,
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
        let expected_sender_fee = calculate_fee_amount(
            amount,
            ctx.accounts.config.send_fee_bps,
            ctx.accounts.config.send_fee_max_ui_micros,
            ctx.accounts.token_mint.decimals,
        )?;
        require!(
            sender_fee_amount == expected_sender_fee,
            TrustLinkEscrowError::InvalidFeeAmount
        );
        token::transfer(ctx.accounts.transfer_to_vault_context(), amount)?;
        if sender_fee_amount > 0 {
            token::transfer(ctx.accounts.transfer_sender_fee_to_treasury_context(), sender_fee_amount)?;
        }

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
        payment.sender_fee_amount = sender_fee_amount;
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
        claim_fee_amount: u64,
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
        let expected_claim_fee = calculate_fee_amount(
            payment.amount,
            ctx.accounts.config.claim_fee_bps,
            ctx.accounts.config.claim_fee_max_ui_micros,
            ctx.accounts.token_mint.decimals,
        )?;
        require!(
            claim_fee_amount == expected_claim_fee,
            TrustLinkEscrowError::InvalidFeeAmount
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
            claim_fee_amount,
            payment.vault_authority_bump,
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.treasury_token_account.to_account_info(),
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
        claim_fee_amount: u64,
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
        let expected_claim_fee = calculate_fee_amount(
            payment.amount,
            ctx.accounts.config.claim_fee_bps,
            ctx.accounts.config.claim_fee_max_ui_micros,
            ctx.accounts.token_mint.decimals,
        )?;
        require!(
            claim_fee_amount == expected_claim_fee,
            TrustLinkEscrowError::InvalidFeeAmount
        );

        release_to_destination(
            payment_id,
            payment.amount,
            claim_fee_amount,
            payment.vault_authority_bump,
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.treasury_token_account.to_account_info(),
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
        claim_fee_amount: u64,
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
        let expected_claim_fee = calculate_fee_amount(
            payment.amount,
            ctx.accounts.config.claim_fee_bps,
            ctx.accounts.config.claim_fee_max_ui_micros,
            ctx.accounts.token_mint.decimals,
        )?;
        require!(
            claim_fee_amount == expected_claim_fee,
            TrustLinkEscrowError::InvalidFeeAmount
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
            claim_fee_amount,
            payment.vault_authority_bump,
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.treasury_token_account.to_account_info(),
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
        claim_fee_amount: u64,
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
        let expected_claim_fee = calculate_fee_amount(
            payment.amount,
            ctx.accounts.config.claim_fee_bps,
            ctx.accounts.config.claim_fee_max_ui_micros,
            ctx.accounts.token_mint.decimals,
        )?;
        require!(
            claim_fee_amount == expected_claim_fee,
            TrustLinkEscrowError::InvalidFeeAmount
        );

        release_to_destination(
            payment_id,
            payment.amount,
            claim_fee_amount,
            payment.vault_authority_bump,
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.treasury_token_account.to_account_info(),
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
            0,
            payment.vault_authority_bump,
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.sender_refund_token_account.to_account_info(),
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
