use anchor_lang::prelude::*;

pub const TCAP_STATE_VERSION_V1: u16 = 1;
pub const TCAP_INSTRUCTION_VERSION_V1: u16 = 1;
pub const TSN_AUTHORIZATION_VERSION_V1: u16 = 1;

/// Version-one TCAP state for a private TINS tip relationship.
///
/// This account deliberately contains only transition commitments and control
/// bits. It must not be extended with public balances, raw TINs, addresses,
/// keys, token accounts, or encrypted snapshot material.
#[account]
pub struct TCapTinTipV1 {
    pub version: u16,
    pub current_commitment: [u8; 32],
    pub sequence: u64,
    pub policy_commitment: [u8; 32],
    pub last_transition_nullifier: [u8; 32],
    pub frozen: bool,
    pub bump: u8,
}

impl TCapTinTipV1 {
    pub const SPACE: usize = 8 + 2 + 32 + 8 + 32 + 32 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TcapMigrationStateV1 {
    Development,
    AuditRequired,
    Ready,
}

#[account]
pub struct TcapGlobalConfigV1 {
    pub version: u16,
    pub protocol_version: u16,
    pub minimum_instruction_version: u16,
    pub governance_authority: Pubkey,
    pub registry_authority: Pubkey,
    pub asset_registry: Pubkey,
    pub emergency_authority: Pubkey,
    pub approved_tsn_program: Pubkey,
    pub proof_verifier_program: Pubkey,
    pub proof_verifier_enabled: bool,
    pub paused: bool,
    pub commitment_root_state: Pubkey,
    pub domain_version: u16,
    pub migration_state: TcapMigrationStateV1,
    pub bump: u8,
}

impl TcapGlobalConfigV1 {
    pub const SPACE: usize = 8 + 2 + 2 + 2 + (32 * 7) + 1 + 1 + 32 + 2 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub struct TcapAssetIdV1 {
    pub token_program: Pubkey,
    pub mint: Pubkey,
    pub registry_version: u32,
    pub asset_commitment: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TcapAssetStatusV1 {
    Proposed,
    Active,
    DepositsPaused,
    WithdrawalsOnly,
    Deprecated,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TcapRiskStateV1 {
    PendingReview,
    Approved,
    Restricted,
    Blocked,
}

#[account]
pub struct TcapAssetRegistryV1 {
    pub version: u16,
    pub config: Pubkey,
    pub authority: Pubkey,
    pub registry_version: u32,
    pub entry_root: [u8; 32],
    pub entry_count: u32,
    pub frozen: bool,
    pub bump: u8,
}

impl TcapAssetRegistryV1 {
    pub const SPACE: usize = 8 + 2 + 32 + 32 + 4 + 32 + 4 + 1 + 1;
}

#[account]
pub struct TcapAssetEntryV1 {
    pub version: u16,
    pub protocol_version: u16,
    pub registry: Pubkey,
    pub token_id: u32,
    pub asset: TcapAssetIdV1,
    pub reserve_state: Pubkey,
    pub future_vault: Pubkey,
    pub reserve_authority: Pubkey,
    pub decimals: u8,
    pub deposits_enabled: bool,
    pub withdrawals_enabled: bool,
    pub paused: bool,
    pub transfer_fee_policy: u8,
    pub freeze_authority_policy: u8,
    pub issuer_control_policy: u8,
    pub governance_approval: [u8; 32],
    pub status: TcapAssetStatusV1,
    pub risk_state: TcapRiskStateV1,
    pub deprecated: bool,
    pub bump: u8,
}

impl TcapAssetEntryV1 {
    pub const SPACE: usize = 8
        + 2
        + 2
        + 32
        + 4
        + (32 + 32 + 4 + 32)
        + (32 * 3)
        + 1
        + 1
        + 1
        + 1
        + 1
        + 1
        + 1
        + 32
        + 1
        + 1
        + 1
        + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub struct TcapMintBindingV1 {
    pub token_program: Pubkey,
    pub mint: Pubkey,
}

#[account]
pub struct TcapAssetStateV1 {
    pub version: u16,
    pub protocol_version: u16,
    pub config: Pubkey,
    pub asset: TcapMintBindingV1,
    pub reserve_state: Pubkey,
    pub future_vault: Pubkey,
    pub reserve_authority: Pubkey,
    pub decimals: u8,
    pub bump: u8,
}

impl TcapAssetStateV1 {
    pub const SPACE: usize = 8 + 2 + 2 + 32 + (32 + 32) + 32 + 32 + 32 + 1 + 1;
}

#[account]
pub struct TcapReserveStateV1 {
    pub version: u16,
    pub protocol_version: u16,
    pub asset_state: Pubkey,
    pub asset_entry: Pubkey,
    pub future_vault: Pubkey,
    pub reserve_authority: Pubkey,
    pub actual_assets: u64,
    pub pending_liabilities: u64,
    pub settled_confidential_liabilities: u64,
    pub authorized_withdrawal_liabilities: u64,
    pub reserved_refund_liabilities: u64,
    pub accounting_epoch: u64,
    pub funding_enabled: bool,
    pub paused: bool,
    pub bump: u8,
    pub reserve_authority_bump: u8,
    pub future_vault_bump: u8,
}

impl TcapReserveStateV1 {
    pub const SPACE: usize = 8 + 2 + 2 + (32 * 4) + (8 * 6) + 1 + 1 + 1 + 1 + 1;
    pub fn total_liabilities(&self) -> Option<u64> {
        self.pending_liabilities
            .checked_add(self.settled_confidential_liabilities)?
            .checked_add(self.authorized_withdrawal_liabilities)?
            .checked_add(self.reserved_refund_liabilities)
    }
}

/// Protocol-owned liquidity accounting skeleton for future exits. It is not
/// wired to any token transfer while proof verification is disabled.
#[account]
pub struct TcapLiquidityPoolV1 {
    pub version: u16,
    pub config: Pubkey,
    pub token_id: u32,
    pub asset_entry: Pubkey,
    pub governance_authority: Pubkey,
    pub actual_assets: u64,
    pub reserved_liabilities: u64,
    pub pending_exits: u64,
    pub paused: bool,
    pub bump: u8,
}

impl TcapLiquidityPoolV1 {
    pub const SPACE: usize = 8 + 2 + (32 * 3) + 4 + (8 * 3) + 1 + 1;
}

#[account]
pub struct TcapExitReceiptV1 {
    pub version: u16,
    pub config: Pubkey,
    pub token_id: u32,
    pub nullifier: [u8; 32],
    pub destination: Pubkey,
    pub destination_binding: [u8; 32],
    pub amount: u64,
    pub consumed: bool,
    pub bump: u8,
}

impl TcapExitReceiptV1 {
    pub const SPACE: usize = 8 + 2 + 32 + 4 + 32 + 32 + 32 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TcapPendingStatusV1 {
    Funded,
    Absorbed,
    Settled,
    Refundable,
    Refunded,
    CarriedForward,
}

#[account]
pub struct TcapPendingLiabilityV1 {
    pub version: u16,
    pub asset_commitment: [u8; 32],
    pub principal_commitment: [u8; 32],
    pub fee_relationship_commitment: [u8; 32],
    pub refund_authority_commitment: [u8; 32],
    pub funding_record_digest: [u8; 32],
    pub epoch_absorption_commitment: [u8; 32],
    pub expiry_ts: i64,
    pub status: TcapPendingStatusV1,
    pub carry_forward_count: u16,
    pub bump: u8,
}

impl TcapPendingLiabilityV1 {
    pub const SPACE: usize = 8 + 2 + (32 * 6) + 8 + 1 + 2 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum NullifierDomainV1 {
    FundedIntentSettlement,
    TcapNoteSpend,
    PublicRefund,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum NullifierStorageModelV1 {
    HybridShardedIndividualPdas,
}

#[account]
pub struct NullifierRegistryV1 {
    pub version: u16,
    pub protocol_version: u16,
    pub config: Pubkey,
    pub domain_separator: [u8; 32],
    pub storage_model: NullifierStorageModelV1,
    pub shard_count: u32,
    pub consumed_count: u64,
    pub paused: bool,
    pub bump: u8,
}

impl NullifierRegistryV1 {
    pub const SPACE: usize = 8 + 2 + 2 + 32 + 32 + 1 + 4 + 8 + 1 + 1;
}

#[account]
pub struct NullifierShardV1 {
    pub version: u16,
    pub registry: Pubkey,
    pub shard_index: u32,
    pub domain: NullifierDomainV1,
    pub record_count: u32,
    pub accumulator_root: [u8; 32],
    pub bump: u8,
}

impl NullifierShardV1 {
    pub const SPACE: usize = 8 + 2 + 32 + 4 + 1 + 4 + 32 + 1;
}

#[account]
pub struct NullifierRecordV1 {
    pub version: u16,
    pub registry: Pubkey,
    pub shard: Pubkey,
    pub domain: NullifierDomainV1,
    pub nullifier: [u8; 32],
    pub epoch_id: u64,
    pub consumed: bool,
    pub creation_authority: Pubkey,
    pub bump: u8,
}

impl NullifierRecordV1 {
    pub const SPACE: usize = 8 + 2 + 32 + 32 + 1 + 32 + 8 + 1 + 32 + 1;
}

#[account]
pub struct TcapCommitmentRootStateV1 {
    pub version: u16,
    pub protocol_version: u16,
    pub current_root: [u8; 32],
    pub previous_root: [u8; 32],
    pub root_version: u32,
    pub sequence: u64,
    pub history_policy: u8,
    pub verifier_config: Pubkey,
    pub verifier_enabled: bool,
    pub paused: bool,
    pub bump: u8,
}

impl TcapCommitmentRootStateV1 {
    pub const SPACE: usize = 8 + 2 + 2 + 32 + 32 + 4 + 8 + 1 + 32 + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TcapTransitionTypeV1 {
    AuthorizationOnly,
    ConfidentialSettlement,
    PublicExit,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub struct TsnSettlementAuthorizationV1 {
    pub version: u16,
    pub tsn_program_id: Pubkey,
    pub epoch_id: u64,
    pub intent_commitment: [u8; 32],
    pub amount: u64,
    pub settlement_commitment: [u8; 32],
    pub accepted_intent_root: [u8; 32],
    pub previous_tcap_root: [u8; 32],
    pub transition_type: TcapTransitionTypeV1,
    pub asset_commitment: [u8; 32],
    pub authorization_digest: [u8; 32],
    pub verifier_domain_version: u16,
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub replay_nonce: [u8; 32],
    pub tin_tip: Pubkey,
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
    pub sequence: u64,
    pub token_id: u32,
    pub policy_commitment: [u8; 32],
    pub gpru_scope_commitment: [u8; 32],
    pub nullifier: [u8; 32],
}

#[account]
pub struct TsnAuthorizationReceiptV1 {
    pub version: u16,
    pub config: Pubkey,
    pub tsn_program_id: Pubkey,
    pub epoch_id: u64,
    pub intent_commitment: [u8; 32],
    pub amount: u64,
    pub settlement_commitment: [u8; 32],
    pub accepted_intent_root: [u8; 32],
    pub previous_tcap_root: [u8; 32],
    pub asset_commitment: [u8; 32],
    pub authorization_digest: [u8; 32],
    pub replay_nonce: [u8; 32],
    pub tin_tip: Pubkey,
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
    pub sequence: u64,
    pub token_id: u32,
    pub policy_commitment: [u8; 32],
    pub gpru_scope_commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub transition_type: TcapTransitionTypeV1,
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub non_spendable: bool,
    pub consumed: bool,
    pub bump: u8,
}

impl TsnAuthorizationReceiptV1 {
    pub const SPACE: usize = 8 + 2 + 32 + 32 + 8 + 32 + 32 + 8 + (32 * 11) + 8 + 4 + 1 + 8 + 8 + 1 + 1 + 1;
}
