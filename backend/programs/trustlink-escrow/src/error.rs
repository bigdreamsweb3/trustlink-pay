use anchor_lang::prelude::*;

#[error_code]
pub enum TrustLinkEscrowError {
    #[msg("Invalid payment amount")]
    InvalidAmount,
    #[msg("Payment is not pending")]
    PaymentNotPending,
    #[msg("Payment has already been settled")]
    PaymentAlreadySettled,
    #[msg("Payment has expired")]
    PaymentExpired,
    #[msg("Payment has not expired yet")]
    PaymentNotExpired,
    #[msg("Unauthorized signer")]
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
}
