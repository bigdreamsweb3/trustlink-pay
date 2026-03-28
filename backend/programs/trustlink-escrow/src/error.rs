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
    #[msg("Treasury token account mint does not match the payment mint")]
    InvalidTreasuryMint,
    #[msg("Recovery token account mint does not match the payment mint")]
    InvalidRecoveryMint,
    #[msg("Fee configuration is invalid")]
    InvalidFeeConfig,
    #[msg("Invalid config authority")]
    InvalidConfigAuthority,
    #[msg("Default expiry configuration is invalid")]
    InvalidDefaultExpiry,
}
