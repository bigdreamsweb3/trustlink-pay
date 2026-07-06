use anchor_lang::prelude::*;

pub mod contexts;
pub mod error;
pub mod helpers;
pub mod instructions;
pub mod state;
pub mod tsn;
pub mod v3;
pub mod v3_state;

pub use contexts::*;
pub use tsn::instructions::*;
use v3::{
    __client_accounts_auto_claim_escrow_v3, __client_accounts_claim_escrow_v3,
    __client_accounts_create_escrow_v3,
};
pub use v3::{
    AutoClaimEscrowArgs, AutoClaimEscrowV3, ClaimEscrowArgs, ClaimEscrowV3, CreateEscrowArgs,
    CreateEscrowV3,
};

use state::PaymentMode;

declare_id!("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");

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
        fee_coverage_tx_count: u16,
        send_fee_max_usd_micros: u64,
        claim_fee_max_usd_micros: u64,
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
            fee_coverage_tx_count,
            send_fee_max_usd_micros,
            claim_fee_max_usd_micros,
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
        new_fee_coverage_tx_count: u16,
        new_send_fee_max_usd_micros: u64,
        new_claim_fee_max_usd_micros: u64,
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
            new_fee_coverage_tx_count,
            new_send_fee_max_usd_micros,
            new_claim_fee_max_usd_micros,
            new_default_expiry_seconds,
        )
    }

    pub fn migrate_legacy_config(
        ctx: Context<MigrateLegacyConfig>,
        new_claim_verifier: Pubkey,
        new_treasury_owner: Pubkey,
        new_send_fee_bps: u16,
        new_send_fee_max_ui_micros: u64,
        new_claim_fee_bps: u16,
        new_claim_fee_max_ui_micros: u64,
        new_fee_coverage_tx_count: u16,
        new_send_fee_max_usd_micros: u64,
        new_claim_fee_max_usd_micros: u64,
        new_default_expiry_seconds: i64,
    ) -> Result<()> {
        instructions::migrate_legacy_config(
            ctx,
            new_claim_verifier,
            new_treasury_owner,
            new_send_fee_bps,
            new_send_fee_max_ui_micros,
            new_claim_fee_bps,
            new_claim_fee_max_ui_micros,
            new_fee_coverage_tx_count,
            new_send_fee_max_usd_micros,
            new_claim_fee_max_usd_micros,
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
        instructions::claim_invite_payment(
            ctx,
            payment_id,
            payment_phone_identity_pubkey,
            claim_fee_amount,
        )
    }

    pub fn mark_expired(ctx: Context<MarkExpired>, payment_id: [u8; 32]) -> Result<()> {
        instructions::mark_expired(ctx, payment_id)
    }

    pub fn refund_expired_payment(
        ctx: Context<RefundExpiredPayment>,
        payment_id: [u8; 32],
    ) -> Result<()> {
        instructions::refund_expired_payment(ctx, payment_id)
    }

    pub fn request_refund(
        ctx: Context<RequestRefund>,
        payment_id: [u8; 32],
        sender_phone_identity_pubkey: Pubkey,
        refund_receiver_pubkey: Pubkey,
    ) -> Result<()> {
        instructions::request_refund(
            ctx,
            payment_id,
            sender_phone_identity_pubkey,
            refund_receiver_pubkey,
        )
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

    pub fn complete_recovery(
        ctx: Context<CompleteRecovery>,
        new_settlement_wallet: Pubkey,
    ) -> Result<()> {
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
        instructions::recover_payment(
            ctx,
            payment_id,
            payment_phone_identity_pubkey,
            payment_receiver_pubkey,
        )
    }

    pub fn expire_payment_to_pool(
        ctx: Context<ExpirePaymentToPool>,
        payment_id: [u8; 32],
    ) -> Result<()> {
        instructions::expire_payment_to_pool(ctx, payment_id)
    }

    pub fn refund_payment(ctx: Context<RefundPayment>, payment_id: [u8; 32]) -> Result<()> {
        instructions::refund_payment(ctx, payment_id)
    }

    // --- TSN (Milestone 4) settlement layer ---
    pub fn tsn_initialize_mother_escrow(
        ctx: Context<InitializeMotherEscrow>,
        tins_program_id: Pubkey,
        protocol_seed: [u8; 32],
        epoch_seconds: i64,
        lease_seconds: i64,
        fee_split_cranker_bps: Option<u16>,
        fee_split_lp_bps: Option<u16>,
        fee_split_treasury_bps: Option<u16>,
    ) -> Result<()> {
        tsn::instructions::initialize_mother_escrow(
            ctx,
            tins_program_id,
            protocol_seed,
            epoch_seconds,
            lease_seconds,
            fee_split_cranker_bps,
            fee_split_lp_bps,
            fee_split_treasury_bps,
        )
    }

    pub fn tsn_register_cranker(ctx: Context<RegisterCranker>) -> Result<()> {
        tsn::instructions::register_cranker(ctx)
    }

    pub fn tsn_migrate_mother_escrow(
        ctx: Context<MigrateMotherEscrow>,
        tins_program_id: Pubkey,
        protocol_seed: [u8; 32],
        epoch_seconds: i64,
        lease_seconds: i64,
        fee_split_cranker_bps: Option<u16>,
        fee_split_lp_bps: Option<u16>,
        fee_split_treasury_bps: Option<u16>,
    ) -> Result<()> {
        tsn::instructions::migrate_mother_escrow(
            ctx,
            tins_program_id,
            protocol_seed,
            epoch_seconds,
            lease_seconds,
            fee_split_cranker_bps,
            fee_split_lp_bps,
            fee_split_treasury_bps,
        )
    }

    pub fn tsn_set_cranker_funding_policy(
        ctx: Context<SetCrankerFundingPolicy>,
        allow_external_funding: bool,
    ) -> Result<()> {
        tsn::instructions::set_cranker_funding_policy(ctx, allow_external_funding)
    }

    pub fn tsn_initialize_cranker_vault(ctx: Context<InitializeCrankerVault>) -> Result<()> {
        tsn::instructions::initialize_cranker_vault(ctx)
    }

    pub fn tsn_fund_cranker(ctx: Context<FundCranker>, amount: u64) -> Result<()> {
        tsn::instructions::fund_cranker(ctx, amount)
    }

    pub fn tsn_withdraw_cranker_funds(
        ctx: Context<WithdrawCrankerFunds>,
        amount: u64,
    ) -> Result<()> {
        tsn::instructions::withdraw_cranker_funds(ctx, amount)
    }

    pub fn tsn_create_intent(
        ctx: Context<CreateIntent>,
        intent_id: [u8; 32],
        underlying_payment: Pubkey,
        token_mint: Pubkey,
        amount: u64,
        recipient_hash: [u8; 32],
    ) -> Result<()> {
        tsn::instructions::create_intent(
            ctx,
            intent_id,
            underlying_payment,
            token_mint,
            amount,
            recipient_hash,
        )
    }

    pub fn tsn_process_payment_intent(
        ctx: Context<ProcessPaymentIntent>,
        payment_intent_id: u64,
        amount: u64,
        transfer_id: [u8; 32],
        commitment_hash: [u8; 32],
    ) -> Result<()> {
        tsn::instructions::process_payment_intent(
            ctx,
            payment_intent_id,
            amount,
            transfer_id,
            commitment_hash,
        )
    }

    pub fn tsn_configure_private_settlement(
        ctx: Context<ConfigurePrivateSettlement>,
        permit_signer: Pubkey,
        enabled: bool,
    ) -> Result<()> {
        tsn::instructions::configure_private_settlement(ctx, permit_signer, enabled)
    }

    pub fn tsn_register_private_commitment(
        ctx: Context<RegisterPrivateCommitment>,
        commitment_hash: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        tsn::instructions::register_private_commitment(ctx, commitment_hash, amount)
    }

    pub fn tsn_execute_pru_spend(
        ctx: Context<ExecutePruSpend>,
        tin: u64,
        pru_index: u16,
        nonce: u8,
        commitment_hash: [u8; 32],
        spend_auth_hash: [u8; 32],
        amount: u64,
        sender_fee_amount: u64,
    ) -> Result<()> {
        tsn::instructions::execute_pru_spend(
            ctx,
            tin,
            pru_index,
            nonce,
            commitment_hash,
            spend_auth_hash,
            amount,
            sender_fee_amount,
        )
    }

    pub fn tsn_execute_private_payout(
        ctx: Context<ExecutePrivatePayout>,
        payout_nullifier: [u8; 32],
        payout_sequence: u64,
        payout_amount: u64,
        claim_fee_amount: u64,
        expires_at_ts: i64,
        permit_signature: [u8; 64],
    ) -> Result<()> {
        tsn::instructions::execute_private_payout(
            ctx,
            payout_nullifier,
            payout_sequence,
            payout_amount,
            claim_fee_amount,
            expires_at_ts,
            permit_signature,
        )
    }

    pub fn tsn_recover_private_escrow(
        ctx: Context<RecoverPrivateEscrow>,
        recovery_nullifier: [u8; 32],
        recovery_sequence: u64,
        recovery_amount: u64,
        expires_at_ts: i64,
        permit_signature: [u8; 64],
    ) -> Result<()> {
        tsn::instructions::recover_private_escrow(
            ctx,
            recovery_nullifier,
            recovery_sequence,
            recovery_amount,
            expires_at_ts,
            permit_signature,
        )
    }

    pub fn tsn_claim_vault_settlement(
        ctx: Context<ClaimVaultSettlement>,
        payment_intent_id: u64,
        otdt_hash: [u8; 32],
    ) -> Result<()> {
        tsn::instructions::claim_vault_settlement(ctx, payment_intent_id, otdt_hash)
    }

    pub fn tsn_finalize_payment_intent(
        ctx: Context<FinalizePaymentIntent>,
        payment_intent_id: u64,
        authorized_amount: u64,
    ) -> Result<()> {
        tsn::instructions::finalize_payment_intent(ctx, payment_intent_id, authorized_amount)
    }

    pub fn tsn_claim_intent(ctx: Context<ClaimIntent>) -> Result<()> {
        tsn::instructions::claim_intent(ctx)
    }

    pub fn tsn_reassign_intent(ctx: Context<ReassignIntent>) -> Result<()> {
        tsn::instructions::reassign_intent(ctx)
    }

    pub fn tsn_submit_proof(
        ctx: Context<SubmitProof>,
        payout_tx_sig: [u8; 64],
        payout_amount: u64,
    ) -> Result<()> {
        tsn::instructions::submit_proof(ctx, payout_tx_sig, payout_amount)
    }

    pub fn tsn_execute_vault_payout(
        ctx: Context<ExecuteVaultPayout>,
        payment_intent_id: u64,
        payout_amount: u64,
        claim_fee_amount: u64,
        otdt: [u8; 32],
        decryption_secret: [u8; 32],
    ) -> Result<()> {
        tsn::instructions::execute_vault_payout(
            ctx,
            payment_intent_id,
            payout_amount,
            claim_fee_amount,
            otdt,
            decryption_secret,
        )
    }

    pub fn tsn_claim_vault_recovery(
        ctx: Context<ClaimVaultRecovery>,
        payment_intent_id: u64,
    ) -> Result<()> {
        tsn::instructions::claim_vault_recovery(ctx, payment_intent_id)
    }

    pub fn tsn_recover_payment_vault(
        ctx: Context<RecoverPaymentVault>,
        payment_intent_id: u64,
    ) -> Result<()> {
        tsn::instructions::recover_payment_vault(ctx, payment_intent_id)
    }

    pub fn tsn_settle_epoch(ctx: Context<SettleEpoch>, force: bool) -> Result<()> {
        tsn::instructions::settle_epoch(ctx, force)
    }
    pub fn tsn_initialize_epoch(ctx: Context<InitializeEpoch>, epoch_id: u64) -> Result<()> {
        tsn::instructions::initialize_epoch(ctx, epoch_id)
    }

    pub fn tsn_open_payment_commitment(
        ctx: Context<OpenPaymentCommitment>,
        commitment_hash: [u8; 32],
        amount: u64,
        nullifier_hash: [u8; 32],
        tin_route_hash: [u8; 32],
        cranker_lease: Pubkey,
        expiry_ts: i64,
    ) -> Result<()> {
        tsn::instructions::open_payment_commitment(
            ctx,
            commitment_hash,
            amount,
            nullifier_hash,
            tin_route_hash,
            cranker_lease,
            expiry_ts,
        )
    }

    pub fn tsn_create_privacy_receive(
        ctx: Context<CreatePrivacyReceive>,
        tin_route_hash: [u8; 32],
        owner_commitment: [u8; 32],
    ) -> Result<()> {
        tsn::instructions::create_privacy_receive(ctx, tin_route_hash, owner_commitment)
    }

    pub fn tsn_process_batch_reimbursement(
        ctx: Context<ProcessBatchReimbursement>,
        recomputed_root_hash: [u8; 32],
        total_to_distribute: u64,
        cranker_credit_sum_mod: u64,
    ) -> Result<()> {
        tsn::instructions::process_batch_reimbursement(
            ctx,
            recomputed_root_hash,
            total_to_distribute,
            cranker_credit_sum_mod,
        )
    }

    pub fn tsn_residual_sweep(ctx: Context<ResidualSweep>) -> Result<()> {
        tsn::instructions::residual_sweep(ctx)
    }

    pub fn tsn_withdraw_verifier_lamports(
        ctx: Context<WithdrawVerifierLamports>,
        amount: u64,
    ) -> Result<()> {
        tsn::instructions::withdraw_verifier_lamports(ctx, amount)
    }

    pub fn tsn_tin_action_fee_commitment(
        ctx: Context<CommitTinActionFee>,
    ) -> Result<()> {
        tsn::instructions::commit_tin_action_fee(ctx)
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
