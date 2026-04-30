use anchor_lang::prelude::*;

#[error_code]
pub enum TrustLinkEscrowError {
    #[msg("Invalid payment amount")]
    InvalidAmount,
    #[msg("Payment is not pending")]
    PaymentNotPending,
    #[msg("Payment has expired")]
    PaymentExpired,
    #[msg("Payment has not expired yet")]
    PaymentNotExpired,
    #[msg("Unauthorized signer or claim data")]
    Unauthorized,
    #[msg("Invalid claim verifier")]
    InvalidClaimVerifier,
    #[msg("Escrow vault balance is insufficient")]
    VaultBalanceMismatch,
    #[msg("Escrow timestamp is invalid")]
    InvalidExpiry,
    #[msg("Receiver token account mint does not match the payment mint")]
    InvalidReceiverMint,
    #[msg("Sender token account mint does not match the payment mint")]
    InvalidSenderMint,
    #[msg("Recovery token account mint does not match the payment mint")]
    InvalidRecoveryMint,
    #[msg("Invalid config authority")]
    InvalidConfigAuthority,
    #[msg("Default expiry configuration is invalid")]
    InvalidDefaultExpiry,
    #[msg("Identity binding already exists")]
    IdentityAlreadyBound,
    #[msg("Identity binding is required")]
    IdentityNotBound,
    #[msg("Identity binding is frozen")]
    IdentityFrozen,
    #[msg("Recovery wallet is not configured")]
    RecoveryNotConfigured,
    #[msg("Recovery wallet is already configured")]
    RecoveryAlreadyConfigured,
    #[msg("Receiver wallet does not match the bound main wallet")]
    InvalidBoundWallet,
    #[msg("Recovery wallet does not match the bound recovery wallet")]
    InvalidRecoveryWallet,
    #[msg("Recovery cannot complete yet")]
    RecoveryNotReady,
    #[msg("Phone identity signer does not match the registered receiver identity")]
    InvalidPhoneIdentity,
    #[msg("Derived receiver authority does not match the stored one-time receiver key")]
    InvalidReceiverAuthority,
    #[msg("Sender identity is missing or invalid for this payment")]
    InvalidSenderIdentity,
    #[msg("Payment mode does not support this instruction")]
    InvalidPaymentMode,
    #[msg("Refund routing is not configured for this payment")]
    RefundRouteNotConfigured,
    #[msg("Refund wait period has not completed yet")]
    RefundNotReady,
    #[msg("Payment is not in expired state")]
    PaymentNotExpiredState,
    #[msg("Escrow has already been claimed or finalized")]
    EscrowAlreadyClaimed,
    #[msg("Derivation proof failed verification")]
    InvalidDerivationProof,
    #[msg("Child signature failed verification")]
    InvalidChildSignature,
    #[msg("Nonce was already consumed")]
    NonceReuse,
    #[msg("Escrow is expired for manual claim")]
    ExpiredEscrow,
    #[msg("Auto-claim is not ready yet")]
    AutoClaimNotReady,
    #[msg("Destination does not match the escrow binding")]
    DestinationMismatch,
    #[msg("Child public key does not match the escrow recipient hash")]
    InvalidChildPublicKey,
    #[msg("Missing required Ed25519 verification instruction")]
    MissingSignatureVerification,
    #[msg("Invalid Ed25519 verification instruction payload")]
    InvalidSignatureVerificationInstruction,
    #[msg("Legacy recovery claim instructions are disabled")]
    LegacyRecoveryClaimDisabled,
    #[msg("Legacy sweep instructions are disabled")]
    LegacySweepDisabled,
    #[msg("Legacy direct refunds are disabled")]
    LegacyDirectRefundDisabled,
}
