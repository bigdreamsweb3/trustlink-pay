use anchor_lang::prelude::*;

pub const TSN_PAYMENT_INTENT_VERSION_V2: u16 = 2;
pub const TSN_TCAP_AUTHORIZATION_VERSION_V1: u16 = 1;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TsnTcapTransitionTypeV1 {
    AuthorizationOnly,
}

/// TSN-side, non-spendable hand-off record for a future TCAP CPI.
#[account]
pub struct TsnTcapAuthorizationV1 {
    pub version: u16,
    pub tcap_program_id: Pubkey,
    pub mother_escrow: Pubkey,
    pub epoch_id: u64,
    pub accepted_intent_root: [u8; 32],
    pub previous_tcap_root: [u8; 32],
    pub asset_commitment: [u8; 32],
    pub authorization_digest: [u8; 32],
    pub replay_nonce: [u8; 32],
    pub transition_type: TsnTcapTransitionTypeV1,
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub non_spendable: bool,
    pub bump: u8,
}

impl TsnTcapAuthorizationV1 {
    pub const SPACE: usize = 8 + 2 + 32 + 32 + 8 + (32 * 5) + 1 + 8 + 8 + 1 + 1;

    pub fn is_valid_at(&self, slot: u64) -> bool {
        self.non_spendable
            && slot >= self.valid_after_slot
            && slot <= self.expires_at_slot
    }
}

#[account]
pub struct TsnFeeReserveStateV1 {
    pub version: u16,
    pub asset_commitment: [u8; 32],
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub refundable_fee_liabilities: u64,
    pub unpaid_cranker_rewards: u64,
    pub protocol_fee_allocations: u64,
    pub carry_forward_fee_liabilities: u64,
    pub claimed_rewards: u64,
    pub paused: bool,
    pub bump: u8,
}

impl TsnFeeReserveStateV1 {
    pub const SPACE: usize = 8 + 2 + 32 + 32 + 32 + (8 * 5) + 1 + 1;

    pub fn outstanding_liabilities(&self) -> Option<u64> {
        self.refundable_fee_liabilities
            .checked_add(self.unpaid_cranker_rewards)?
            .checked_add(self.protocol_fee_allocations)?
            .checked_add(self.carry_forward_fee_liabilities)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PaymentIntentV2Status {
    Funded,
    EpochAssigned,
    CarriedForward,
    Settled,
    Expired,
    Refundable,
    Closed,
}

#[account]
pub struct PaymentIntentV2 {
    pub version: u16,
    pub canonical_intent_digest: [u8; 32],
    pub funded_commitment_reference: [u8; 32],
    pub payer_authorization_commitment: [u8; 32],
    pub recipient_route_commitment: [u8; 32],
    pub asset_commitment: [u8; 32],
    pub amount_commitment: [u8; 32],
    pub settlement_fee_commitment: [u8; 32],
    pub protocol_fee_commitment: [u8; 32],
    pub expiry_ts: i64,
    pub nonce_commitment: [u8; 32],
    pub replay_protection_commitment: [u8; 32],
    pub refund_policy_commitment: [u8; 32],
    pub settlement_conditions_commitment: [u8; 32],
    pub epoch_assignment_commitment: [u8; 32],
    pub pending_liability_commitment: [u8; 32],
    pub proof_domain_version: u16,
    pub status: PaymentIntentV2Status,
    pub bump: u8,
}

impl PaymentIntentV2 {
    pub const SPACE: usize = 8 + 2 + (32 * 14) + 8 + 2 + 1 + 1;
}

#[account]
pub struct EpochCommitmentStateV1 {
    pub version: u16,
    pub epoch_id: u64,
    pub accepted_intent_root: [u8; 32],
    pub previous_tcap_state_root: [u8; 32],
    pub eligibility_root: [u8; 32],
    pub settlement_result_root: [u8; 32],
    pub next_tcap_state_root: [u8; 32],
    pub reward_allocation_root: [u8; 32],
    pub carried_forward_intent_root: [u8; 32],
    pub expired_intent_root: [u8; 32],
    pub refund_allocation_root: [u8; 32],
    pub finalized: bool,
    pub bump: u8,
}

impl EpochCommitmentStateV1 {
    pub const SPACE: usize = 8 + 2 + 8 + (32 * 9) + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum SettlementModeV1 {
    Public,
    Confidential,
}

#[account]
pub struct SettlementReceiptV1 {
    pub version: u16,
    pub epoch_id: u64,
    pub settlement_nullifier: [u8; 32],
    pub mode: SettlementModeV1,
    pub asset_commitment: [u8; 32],
    pub result_commitment: [u8; 32],
    pub cranker_commitment: [u8; 32],
    pub fee_receipt_commitment: [u8; 32],
    pub bump: u8,
}

impl SettlementReceiptV1 {
    pub const SPACE: usize = 8 + 2 + 8 + 32 + 1 + (32 * 4) + 1;
}

#[account]
pub struct RewardAllocationStateV1 {
    pub version: u16,
    pub epoch_id: u64,
    pub allocation_root: [u8; 32],
    pub total_allocated: u64,
    pub total_claimed: u64,
    pub finalized: bool,
    pub bump: u8,
}

impl RewardAllocationStateV1 {
    pub const SPACE: usize = 8 + 2 + 8 + 32 + 8 + 8 + 1 + 1;
}
