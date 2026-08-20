// Re-export all blockchain functions - this file acts as facade to avoid "use server" re-export issues

// From solana-core
export {
  confirmIdentityBindingState,
  createDraftPaymentId,
  prepareAddRecoveryWalletTransaction,
  prepareInitializeIdentityBindingTransaction,
  prepareRequestRecoveryTransaction,
  prepareSetIdentityFreezeTransaction,
  getIdentityBindingPda,
  getIdentityBindingState,
  getEscrowConfigState,
  getEscrowDepositAddress,
  getEscrowVerifierPublicKey,
  initializeEscrowConfig,
  isEscrowConfigInitialized,
  updateEscrowConfig,
} from "@/app/blockchain/solana-core";

export type {
  ClaimFeeEstimate,
  SenderTransferFeeEstimate,
  SupportedWalletToken,
  WalletTokenInfo,
} from "@/app/blockchain/solana-core";

export {
  listSupportedWalletTokens,
  estimateClaimFee,
  estimateSenderTransferCost,
} from "@/app/blockchain/solana-core";

// From TSN - TSN handles all payment operations now
export {
  getTsnCrankerPda,
  getTsnCrankerVaultAuthorityPda,
  getTsnCrankerVaultPda,
  getTsnCrankerVaultTokenPda,
  getTsnLiquidityPositionPda,
  getTsnMotherEscrowPda,
  tsnFetchMotherEscrowOnChain,
  sha256Bytes,
  tsnFundCrankerOnChain,
  tsnInitializeCrankerVaultOnChain,
  tsnInitializeMotherEscrowOnChain,
  tsnMigrateMotherEscrowOnChain,
  tsnRegisterCrankerOnChain,
  tsnSetCrankerFundingPolicyOnChain,
  tsnWithdrawCrankerFundsOnChain,
} from "@trustlink/tsn-sdk";
