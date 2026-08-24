use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AcceptedIntentStatus { Accepted, Consumed }

/// One Mother-authorized ConfidentialSettlement intent. The root is derived
/// from these fields on-chain; callers cannot choose an arbitrary root.
#[account]
pub struct AcceptedIntentV1 {
    pub version: u16,
    pub epoch_id: u64,
    pub intent_commitment: [u8; 32],
    pub amount: u64,
    pub token_id: u32,
    pub tip_root_commitment: [u8; 32],
    pub settlement_commitment: [u8; 32],
    pub asset_commitment: [u8; 32],
    pub policy_commitment: [u8; 32],
    pub gpru_scope_commitment: [u8; 32],
    pub replay_nonce: [u8; 32],
    pub nullifier: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub accepted_intent_root: [u8; 32],
    pub status: AcceptedIntentStatus,
    pub mother_escrow: Pubkey,
    pub bump: u8,
}

impl AcceptedIntentV1 { pub const VERSION: u16 = 1; pub const SPACE: usize = 8 + 2 + 8 + 32 + 8 + 4 + (32 * 8) + 8 + 8 + 32 + 1 + 32 + 1; }

/// Canonical TSN header consumed by TCap when it validates a confidential
/// settlement authorization. Keep the first four fields ABI-compatible with
/// TCap's `TsnEpochCommitmentHeaderV1` reader.
#[account]
pub struct EpochCommitmentStateV1 {
    pub version: u16,
    pub epoch_id: u64,
    pub accepted_intent_root: [u8; 32],
    pub previous_tcap_state_root: [u8; 32],
    pub mother_escrow: Pubkey,
    pub bump: u8,
}

impl EpochCommitmentStateV1 {
    pub const VERSION: u16 = 1;
    pub const SPACE: usize = 8 + 2 + 8 + 32 + 32 + 32 + 1;
}

#[account]
pub struct PrivateSettlementConfig {
    pub mother_escrow: Pubkey,
    pub authority: Pubkey,
    pub permit_signer: Pubkey,
    pub enabled: bool,
    pub bump: u8,
}

impl PrivateSettlementConfig { pub const SPACE: usize = 8 + 32 + 32 + 32 + 1 + 1; }

#[account]
pub struct EpochTreasury {
    pub mother_escrow: Pubkey,
    pub epoch_id: u64,
    pub token_mint: Pubkey,
    pub token_account: Pubkey,
    pub total_funded: u64,
    pub pending_liability: u64,
    pub settled_total: u64,
    pub refunded_total: u64,
    pub reimbursed_total: u64,
    pub closed: bool,
    pub bump: u8,
}
impl EpochTreasury { pub const SPACE: usize = 8 + 32 + 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 1; }

#[account]
pub struct EpochSettlementLedger {
    pub epoch_treasury: Pubkey,
    pub epoch_id: u64,
    pub token_mint: Pubkey,
    pub pending_total: u64,
    pub settled_total: u64,
    pub refunded_total: u64,
    pub slot_count: u64,
    pub closed: bool,
    pub bump: u8,
}
impl EpochSettlementLedger { pub const SPACE: usize = 8 + 32 + 8 + 32 + 8 + 8 + 8 + 8 + 1 + 1; }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ClaimSlotStatus { Settled, Refunded }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum SettlementDnaStatus { Active, Consumed }

#[account]
pub struct SettlementDna {
    pub mother_escrow: Pubkey,
    pub slot: [u8; 32],
    pub commitment_digest: [u8; 32],
    pub settlement_commitment: [u8; 32],
    pub payout_nullifier: [u8; 32],
    pub random_nonce: [u8; 32],
    pub cranker: Pubkey,
    pub cranker_vault: Pubkey,
    pub recipient: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub lease_id_hash: [u8; 32],
    pub lease_version: u64,
    pub lease_expiry_ts: i64,
    pub authorization_expiry_ts: i64,
    pub status: SettlementDnaStatus,
    pub bump: u8,
}
impl SettlementDna { pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 32 + 8 + 8 + 8 + 1 + 1; }

/// Opaque one-time state created only by the first settlement/refund attempt.
/// It contains no payment ID, sender, recipient, or escrow address.
#[account]
pub struct EpochClaimSlot {
    pub epoch_treasury: Pubkey,
    pub slot: [u8; 32],
    pub amount: u64,
    pub token_mint: Pubkey,
    pub status: ClaimSlotStatus,
    pub settlement_cranker: Pubkey,
    pub cranker_vault: Pubkey,
    pub commitment_digest: [u8; 32],
    pub settlement_commitment: [u8; 32],
    pub payout_nullifier: [u8; 32],
    pub random_nonce: [u8; 32],
    pub recipient: Pubkey,
    pub lease_id_hash: [u8; 32],
    pub lease_version: u64,
    pub lease_expiry_ts: i64,
    pub authorization_expiry_ts: i64,
    pub reimbursed: bool,
    pub bump: u8,
}
impl EpochClaimSlot { pub const SPACE: usize = 8 + 32 + 32 + 8 + 32 + 1 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1; }
