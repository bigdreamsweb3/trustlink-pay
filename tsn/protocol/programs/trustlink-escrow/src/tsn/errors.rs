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
    #[msg("Fee split math overflowed")]
    FeeSplitOverflow,
    #[msg("Invalid verifier PDA")]
    InvalidVerifierPda,
    #[msg("Verifier PDA has insufficient lamports")]
    InsufficientVerifierLamports,
    #[msg("Payment vault is already initialized")]
    PaymentVaultAlreadyInitialized,
    #[msg("Payment intent is already initialized")]
    PaymentIntentAlreadyInitialized,
    #[msg("Invalid unique token account")]
    InvalidUniqueTokenAccount,
    #[msg("Payment intent funding math overflowed")]
    PaymentIntentFundingOverflow,
    #[msg("Cranker does not have a payment-intent credit available")]
    InsufficientCrankerClaimCredits,
    #[msg("Cranker payment-intent credit counter overflowed")]
    CrankerClaimCreditOverflow,
    #[msg("Cranker vault has insufficient liquidity")]
    InsufficientCrankerVaultLiquidity,
    #[msg("Settlement commitment does not match the encrypted token secret")]
    InvalidSettlementCommitment,
    #[msg("One-time decryption token does not match the active lease")]
    InvalidOneTimeDecryptionToken,
    #[msg("One-time decryption token has already been consumed")]
    OneTimeDecryptionTokenAlreadyUsed,
    #[msg("Settlement vault is not in the required state")]
    InvalidVaultSettlementState,
    #[msg("Settlement vault is not recoverable")]
    VaultNotRecoverable,
    #[msg("Recovery must return principal to the Cranker vault that funded settlement")]
    InvalidRecoveryDestination,
    #[msg("Recovery lease is still active")]
    RecoveryLeaseStillActive,
    #[msg("Recovery vault token account is invalid")]
    InvalidRecoveryVaultTokenAccount,
    #[msg("Payment vault has not received the authorized token amount")]
    InvalidPaymentVaultFunding,
}
