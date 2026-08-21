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
    #[msg("Withdraw amount exceeds the funder's pro-rata LP claim")]
    InsufficientLiquidityPosition,
    #[msg("Deposit is too small to mint an LP share")]
    InvalidLiquidityShareAmount,
    #[msg("Vault does not have enough unreserved liquidity")]
    InsufficientWithdrawableLiquidity,
    #[msg("Settlement reservation is missing or insufficient")]
    InvalidLiquidityReservation,
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
    #[msg("Epoch treasury cannot reimburse this settlement")]
    InsufficientEpochTreasuryLiquidity,
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
    #[msg("Payment vault has not received the authorized token amount")]
    InvalidPaymentVaultFunding,
    #[msg("Private settlement permits are disabled")]
    PrivateSettlementDisabled,
    #[msg("Private settlement permit has expired")]
    PermitExpired,
    #[msg("Permit signer cannot be the default public key")]
    InvalidPermitSigner,
    #[msg("Required Ed25519 permit verification instruction is missing")]
    MissingPermitVerification,
    #[msg("Ed25519 permit verification instruction does not match this action")]
    InvalidPermitVerification,
    #[msg("Epoch treasury token account is invalid")]
    InvalidEpochTreasuryTokenAccount,
    #[msg("Settlement destination token account is invalid")]
    InvalidSettlementDestination,
    #[msg("Settlement destination token account is invalid")]
    InvalidRecoveryDestination,
    #[msg("Private settlement commitment is invalid")]
    InvalidPrivateCommitment,
    #[msg("PRU spend guard is inactive")]
    InactivePruSpendGuard,
    #[msg("PRU spend nonce was already used")]
    PruSpendNonceAlreadyUsed,
    #[msg("Invalid PRU spend authority")]
    InvalidPruSpendAuthority,
}
