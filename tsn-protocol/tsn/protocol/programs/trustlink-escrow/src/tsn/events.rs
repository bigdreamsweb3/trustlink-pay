use anchor_lang::prelude::*;

#[event]
pub struct TsnMotherEscrowInitialized {
    pub mother_escrow: Pubkey,
    pub authority: Pubkey,
    pub epoch_seconds: i64,
    pub lease_seconds: i64,
}

#[event]
pub struct TsnCrankerRegistered {
    pub mother_escrow: Pubkey,
    pub cranker: Pubkey,
    pub operator: Pubkey,
}

#[event]
pub struct TsnIntentCreated {
    pub mother_escrow: Pubkey,
    pub intent: Pubkey,
    pub intent_id: [u8; 32],
    pub amount: u64,
    pub token_mint: Pubkey,
}

#[event]
pub struct TsnLeaseClaimed {
    pub intent: Pubkey,
    pub cranker: Pubkey,
    pub lease_expiry_ts: i64,
}

#[event]
pub struct TsnLeaseExpired {
    pub intent: Pubkey,
    pub previous_cranker: Pubkey,
}

#[event]
pub struct TsnProofSubmitted {
    pub intent: Pubkey,
    pub cranker: Pubkey,
    pub payout_amount: u64,
    pub fee_amount: u64,
    pub operator_fee_amount: u64,
    pub lp_fee_amount: u64,
    pub treasury_fee_amount: u64,
}

#[event]
pub struct TsnEpochSettled {
    pub mother_escrow: Pubkey,
    pub epoch_id: u64,
}

#[event]
pub struct TsnCrankerFundingPolicyUpdated {
    pub cranker: Pubkey,
    pub operator: Pubkey,
    pub allow_external_funding: bool,
}

#[event]
pub struct TsnCrankerVaultInitialized {
    pub cranker: Pubkey,
    pub cranker_vault: Pubkey,
    pub token_mint: Pubkey,
    pub vault_token_account: Pubkey,
}

#[event]
pub struct TsnCrankerFunded {
    pub cranker: Pubkey,
    pub cranker_vault: Pubkey,
    pub funder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TsnCrankerFundsWithdrawn {
    pub cranker: Pubkey,
    pub cranker_vault: Pubkey,
    pub funder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TsnCommitmentRegistered {
    pub vault: Pubkey,
    pub transfer_id: [u8; 32],
    pub commitment_hash: [u8; 32],
    pub epoch_id: u64,
    pub created_at_ts: i64,
}

#[event]
pub struct TsnPaymentIntentValidated {
    pub vault: Pubkey,
    pub cranker: Pubkey,
    pub amount: u64,
    pub claim_credits: u64,
}

#[event]
pub struct TsnSettlementLeaseClaimed {
    pub vault: Pubkey,
    pub cranker: Pubkey,
    pub otdt_hash: [u8; 32],
    pub lease_expiry_ts: i64,
}

#[event]
pub struct TsnSettlementCommitted {
    pub vault: Pubkey,
    pub transfer_id: [u8; 32],
    pub settlement_cranker: Pubkey,
    pub commitment_hash: [u8; 32],
    pub paid_at_ts: i64,
    pub recoverable: bool,
}

#[event]
pub struct TsnRecoveryLeaseClaimed {
    pub vault: Pubkey,
    pub recovery_cranker: Pubkey,
    pub lease_expiry_ts: i64,
}

#[event]
pub struct TsnVaultRecovered {
    pub vault: Pubkey,
    pub settlement_cranker: Pubkey,
    pub recovery_cranker: Pubkey,
    pub recovered_amount: u64,
    pub recovered_at_ts: i64,
}

#[event]
pub struct TsnPrivateSettlementConfigured {
    pub mother_escrow: Pubkey,
    pub permit_signer: Pubkey,
    pub enabled: bool,
}

#[event]
pub struct TsnPrivateCommitmentRegistered {
    pub commitment_hash: [u8; 32],
    pub token_mint: Pubkey,
    pub amount: u64,
    pub epoch_id: u64,
}

#[event]
pub struct TsnPruSpendExecuted {
    pub tin: u64,
    pub pru_index: u16,
    pub nonce: u8,
    pub pru_authority: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub commitment_hash: [u8; 32],
    pub epoch_id: u64,
}

#[event]
pub struct TsnPrivatePayoutExecuted {
    pub payout_nullifier: [u8; 32],
    pub payout_sequence: u64,
    pub cranker: Pubkey,
    pub token_mint: Pubkey,
    pub payout_amount: u64,
}

#[event]
pub struct TsnPrivateEscrowRecovered {
    pub recovery_nullifier: [u8; 32],
    pub recovery_sequence: u64,
    pub recovery_cranker: Pubkey,
    pub token_mint: Pubkey,
    pub recovered_amount: u64,
}

#[event]
pub struct TsnPaymentCommitmentOpened {
    pub epoch_account: Pubkey,
    pub commitment_hash: [u8; 32],
    pub amount: u64,
}

#[event]
pub struct TsnPrivacyReceiveCreated {
    pub privacy_receive: Pubkey,
    pub tin_route_hash: [u8; 32],
}

#[event]
pub struct TsnEpochChallengeCommitted {
    pub epoch_account: Pubkey,
    pub root_hash: [u8; 32],
    pub total_to_distribute: u64,
    pub cranker_credit_sum_mod: u64,
}

#[event]
pub struct TsnEpochReimbursementProcessed {
    pub epoch_account: Pubkey,
    pub winner: Pubkey,
    pub lp_amount: u64,
    pub operator_amount: u64,
    pub treasury_amount: u64,
    pub bonus_amount: u64,
}

#[event]
pub struct TsnResidualSwept {
    pub epoch_account: Pubkey,
    pub swept_at_ts: i64,
}
