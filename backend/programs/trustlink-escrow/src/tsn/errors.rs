use anchor_lang::prelude::*;

#[error_code]
pub enum TsnError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid fee split bps")]
    InvalidFeeSplit,
    #[msg("Intent is not pending")]
    IntentNotPending,
    #[msg("Intent lease is not claimable")]
    IntentNotClaimable,
    #[msg("Lease is expired")]
    LeaseExpired,
    #[msg("Lease is still active")]
    LeaseStillActive,
    #[msg("Cranker does not hold the lease")]
    NotAssignedCranker,
    #[msg("Intent already executed or settled")]
    IntentAlreadyFinalized,
    #[msg("Proof already submitted")]
    ProofAlreadySubmitted,
    #[msg("Cranker DNA mismatch")]
    CrankerDnaMismatch,
    #[msg("External funding is disabled for this Cranker")]
    ExternalFundingDisabled,
    #[msg("Withdraw amount exceeds funder's available principal")]
    InsufficientLiquidityPosition,
    #[msg("Invalid Cranker vault authority")]
    InvalidCrankerVaultAuthority,
    #[msg("Settlement epoch is not ready yet")]
    EpochNotReady,
    #[msg("Invalid payout amount")]
    InvalidPayoutAmount,
    #[msg("Invalid mother escrow account")]
    InvalidMotherEscrowAccount,
}
