use anchor_lang::prelude::*;

pub mod tsn;

pub use tsn::instructions::*;


declare_id!("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");

#[program]
pub mod trustlink_escrow {
    use super::*;

    pub fn tsn_accept_intent(ctx: Context<AcceptIntent>, args: AcceptIntentArgs) -> Result<()> {
        tsn::instructions::accept_intent::handler(ctx, args)
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

    pub fn tsn_fund_epoch_treasury(ctx: Context<FundEpochTreasury>, epoch_id: u64, amount: u64) -> Result<()> {
        tsn::instructions::fund_epoch_treasury(ctx, epoch_id, amount)
    }

    pub fn tsn_withdraw_cranker_funds(
        ctx: Context<WithdrawCrankerFunds>,
        amount: u64,
    ) -> Result<()> {
        tsn::instructions::withdraw_cranker_funds(ctx, amount)
    }

    pub fn tsn_configure_private_settlement(
        ctx: Context<ConfigurePrivateSettlement>,
        permit_signer: Pubkey,
        enabled: bool,
    ) -> Result<()> {
        tsn::instructions::configure_private_settlement(ctx, permit_signer, enabled)
    }

    pub fn tsn_create_settlement_dna(ctx: Context<CreateSettlementDna>, slot: [u8; 32], lease_version: u64, commitment_digest: [u8; 32], settlement_commitment: [u8; 32], payout_nullifier: [u8; 32], random_nonce: [u8; 32], cranker: Pubkey, cranker_vault: Pubkey, recipient: Pubkey, token_mint: Pubkey, amount: u64, lease_id_hash: [u8; 32], lease_expiry_ts: i64, authorization_expiry_ts: i64) -> Result<()> {
        tsn::instructions::create_settlement_dna(ctx, slot, lease_version, commitment_digest, settlement_commitment, payout_nullifier, random_nonce, cranker, cranker_vault, recipient, token_mint, amount, lease_id_hash, lease_expiry_ts, authorization_expiry_ts)
    }

    pub fn tsn_execute_private_payout(ctx: Context<ExecutePrivatePayout>, slot: [u8; 32], settlement_commitment: [u8; 32], commitment_digest: [u8; 32], random_nonce: [u8; 32], payout_nullifier: [u8; 32], payout_amount: u64, claim_fee_amount: u64, lease_id_hash: [u8; 32], lease_version: u64, lease_expiry_ts: i64, expires_at_ts: i64, permit_signature: [u8; 64]) -> Result<()> {
        tsn::instructions::execute_private_payout(ctx, slot, settlement_commitment, commitment_digest, random_nonce, payout_nullifier, payout_amount, claim_fee_amount, lease_id_hash, lease_version, lease_expiry_ts, expires_at_ts, permit_signature)
    }

    pub fn tsn_refund_epoch_claim(ctx: Context<RefundEpochClaim>, slot: [u8; 32], lease_version: u64, commitment_digest: [u8; 32], refund_nullifier: [u8; 32], refund_amount: u64, expires_at_ts: i64, permit_signature: [u8; 64]) -> Result<()> {
        tsn::instructions::refund_epoch_claim(ctx, slot, lease_version, commitment_digest, refund_nullifier, refund_amount, expires_at_ts, permit_signature)
    }

    pub fn tsn_close_epoch_treasury(ctx: Context<CloseEpochTreasury>) -> Result<()> {
        tsn::instructions::close_epoch_treasury(ctx)
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

    pub fn tsn_register_tcap_credit_authorization(
        ctx: Context<RegisterTcapCreditAuthorization>,
        args: RegisterTcapCreditAuthorizationArgs,
    ) -> Result<()> {
        tsn::instructions::register_tcap_credit_authorization(ctx, args)
    }

    pub fn tsn_register_tcap_credit_authorization_v2(
        ctx: Context<RegisterTcapCreditAuthorizationV2>,
        args: RegisterTcapCreditAuthorizationV2Args,
    ) -> Result<()> {
        tsn::instructions::register_tcap_credit_authorization_v2::handler(ctx, args)
    }

    pub fn tsn_register_tcap_debit_authorization_v2(
        ctx: Context<RegisterTcapDebitAuthorizationV2>,
        args: RegisterTcapDebitAuthorizationV2Args,
    ) -> Result<()> {
        tsn::instructions::register_tcap_debit_authorization_v2::handler(ctx, args)
    }

    pub fn tsn_register_tcap_exit_authorization_v1(
        ctx: Context<RegisterTcapExitAuthorizationV1>,
        args: RegisterTcapExitAuthorizationV1Args,
    ) -> Result<()> {
        tsn::instructions::register_tcap_exit_authorization_v1::handler(ctx, args)
    }

    pub fn tsn_register_tcap_one_time_tip_authorization(
        ctx: Context<RegisterTcapOneTimeTipAuthorization>,
        args: RegisterTcapOneTimeTipAuthorizationArgs,
    ) -> Result<()> {
        tsn::instructions::register_tcap_one_time_tip_authorization::handler(ctx, args)
    }

    pub fn tsn_store_tcap_encrypted_snapshot(
        ctx: Context<StoreTcapEncryptedSnapshot>,
        args: StoreTcapEncryptedSnapshotArgs,
    ) -> Result<()> {
        tsn::instructions::store_tcap_encrypted_snapshot::handler(ctx, args)
    }

    pub fn tsn_register_tcap_one_time_credit(
        ctx: Context<RegisterTcapOneTimeCredit>,
        args: RegisterTcapOneTimeCreditArgs,
    ) -> Result<()> {
        tsn::instructions::register_tcap_one_time_credit::handler(ctx, args)
    }

    pub fn tsn_register_tcap_one_time_transfer_credit(
        ctx: Context<RegisterTcapOneTimeTransferCredit>,
        args: RegisterTcapOneTimeTransferCreditArgs,
    ) -> Result<()> {
        tsn::instructions::register_tcap_one_time_transfer_credit::handler(ctx, args)
    }

}
