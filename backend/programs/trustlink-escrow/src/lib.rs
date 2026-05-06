use anchor_lang::prelude::*;

pub mod contexts;
pub mod error;
pub mod helpers;
pub mod instructions;
pub mod state;
pub mod v3;
pub mod v3_state;

pub use contexts::*;
pub use v3::{
    AutoClaimEscrowArgs, AutoClaimEscrowV3, ClaimEscrowArgs, ClaimEscrowV3, CreateEscrowArgs, CreateEscrowV3,
};
use v3::{
    __client_accounts_auto_claim_escrow_v3, __client_accounts_claim_escrow_v3, __client_accounts_create_escrow_v3,
};

use state::PaymentMode;

declare_id!("BQCDZF8gFs35xiEUEZbvgkLufMjrcysw5yPdv3MVZohM");

#[program]
pub mod trustlink_escrow {
    use super::*;

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
        instructions::initialize_config(
            ctx,
            claim_verifier,
            treasury_owner,
            send_fee_bps,
            send_fee_max_ui_micros,
            claim_fee_bps,
            claim_fee_max_ui_micros,
            default_expiry_seconds,
        )
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
        instructions::update_config(
            ctx,
            new_claim_verifier,
            new_treasury_owner,
            new_send_fee_bps,
            new_send_fee_max_ui_micros,
            new_claim_fee_bps,
            new_claim_fee_max_ui_micros,
            new_default_expiry_seconds,
        )
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
        sender_fee_amount: u64,
        expiry_ts: i64,
    ) -> Result<()> {
        instructions::create_payment(
            ctx,
            payment_id,
            phone_identity_pubkey,
            payment_receiver_pubkey,
            payment_mode,
            amount,
            sender_fee_amount,
            expiry_ts,
        )
    }

    pub fn initialize_identity_binding(
        ctx: Context<InitializeIdentityBinding>,
        phone_identity_pubkey: Pubkey,
    ) -> Result<()> {
        instructions::initialize_identity_binding(ctx, phone_identity_pubkey)
    }

    pub fn claim_and_bind_first_wallet(
        ctx: Context<ClaimAndBindFirstWallet>,
        payment_id: [u8; 32],
        payment_phone_identity_pubkey: Pubkey,
        binding_phone_identity_pubkey: Pubkey,
        payment_receiver_pubkey: Pubkey,
        claim_fee_amount: u64,
    ) -> Result<()> {
        instructions::claim_and_bind_first_wallet(
            ctx,
            payment_id,
            payment_phone_identity_pubkey,
            binding_phone_identity_pubkey,
            payment_receiver_pubkey,
            claim_fee_amount,
        )
    }

    pub fn add_recovery_wallet(
        ctx: Context<AddRecoveryWallet>,
        recovery_wallet: Pubkey,
        allow_update: bool,
    ) -> Result<()> {
        instructions::add_recovery_wallet(ctx, recovery_wallet, allow_update)
    }

    pub fn claim_payment(
        ctx: Context<ClaimPayment>,
        payment_id: [u8; 32],
        payment_phone_identity_pubkey: Pubkey,
        payment_receiver_pubkey: Pubkey,
        claim_fee_amount: u64,
    ) -> Result<()> {
        instructions::claim_payment(
            ctx,
            payment_id,
            payment_phone_identity_pubkey,
            payment_receiver_pubkey,
            claim_fee_amount,
        )
    }

    pub fn claim_invite_and_bind_first_wallet(
        ctx: Context<ClaimInviteAndBindFirstWallet>,
        payment_id: [u8; 32],
        payment_phone_identity_pubkey: Pubkey,
        binding_phone_identity_pubkey: Pubkey,
        claim_fee_amount: u64,
    ) -> Result<()> {
        instructions::claim_invite_and_bind_first_wallet(
            ctx,
            payment_id,
            payment_phone_identity_pubkey,
            binding_phone_identity_pubkey,
            claim_fee_amount,
        )
    }

    pub fn claim_invite_payment(
        ctx: Context<ClaimInvitePayment>,
        payment_id: [u8; 32],
        payment_phone_identity_pubkey: Pubkey,
        claim_fee_amount: u64,
    ) -> Result<()> {
        instructions::claim_invite_payment(ctx, payment_id, payment_phone_identity_pubkey, claim_fee_amount)
    }

    pub fn mark_expired(ctx: Context<MarkExpired>, payment_id: [u8; 32]) -> Result<()> {
        instructions::mark_expired(ctx, payment_id)
    }

    pub fn refund_expired_payment(ctx: Context<RefundExpiredPayment>, payment_id: [u8; 32]) -> Result<()> {
        instructions::refund_expired_payment(ctx, payment_id)
    }

    pub fn request_refund(
        ctx: Context<RequestRefund>,
        payment_id: [u8; 32],
        sender_phone_identity_pubkey: Pubkey,
        refund_receiver_pubkey: Pubkey,
    ) -> Result<()> {
        instructions::request_refund(ctx, payment_id, sender_phone_identity_pubkey, refund_receiver_pubkey)
    }

    pub fn claim_refund(ctx: Context<ClaimRefund>, payment_id: [u8; 32]) -> Result<()> {
        instructions::claim_refund(ctx, payment_id)
    }

    pub fn claim_refund_and_bind_first_wallet(
        ctx: Context<ClaimRefundAndBindFirstWallet>,
        payment_id: [u8; 32],
    ) -> Result<()> {
        instructions::claim_refund_and_bind_first_wallet(ctx, payment_id)
    }

    pub fn request_recovery(ctx: Context<RequestRecovery>) -> Result<()> {
        instructions::request_recovery(ctx)
    }

    pub fn complete_recovery(ctx: Context<CompleteRecovery>, new_settlement_wallet: Pubkey) -> Result<()> {
        instructions::complete_recovery(ctx, new_settlement_wallet)
    }

    pub fn set_identity_freeze(ctx: Context<SetIdentityFreeze>, frozen: bool) -> Result<()> {
        instructions::set_identity_freeze(ctx, frozen)
    }

    pub fn recover_payment(
        ctx: Context<RecoverPayment>,
        payment_id: [u8; 32],
        payment_phone_identity_pubkey: Pubkey,
        payment_receiver_pubkey: Pubkey,
    ) -> Result<()> {
        instructions::recover_payment(ctx, payment_id, payment_phone_identity_pubkey, payment_receiver_pubkey)
    }

    pub fn expire_payment_to_pool(ctx: Context<ExpirePaymentToPool>, payment_id: [u8; 32]) -> Result<()> {
        instructions::expire_payment_to_pool(ctx, payment_id)
    }

    pub fn refund_payment(ctx: Context<RefundPayment>, payment_id: [u8; 32]) -> Result<()> {
        instructions::refund_payment(ctx, payment_id)
    }
}
#[cfg(test)]
mod unit_tests {
    use crate::state::PaymentStatus;

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
