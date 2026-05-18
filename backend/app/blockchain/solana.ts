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
  BlockchainExecutionMode,
  ClaimFeeEstimate,
  SenderTransferFeeEstimate,
  SupportedWalletToken,
} from "@/app/blockchain/solana-core";

// From solana-payments
export {
  confirmEscrowPayment,
  estimateClaimFee,
  estimateSenderTransferCost,
  listSupportedWalletTokens,
  markPaymentExpiredOnChain,
  prepareExpiredRefundClaim,
  prepareEscrowClaim,
  prepareEscrowPayment,
} from "@/app/blockchain/solana-payments";

// From TSN
export {
  getTsnCrankerPda,
  getTsnCrankerVaultAuthorityPda,
  getTsnCrankerVaultPda,
  getTsnCrankerVaultTokenPda,
  getTsnIntentPda,
  getTsnLiquidityPositionPda,
  getTsnMotherEscrowPda,
  estimateTsnClaimNetworkFeeLamports,
  tsnFetchIntentOnChain,
  tsnFetchMotherEscrowOnChain,
  sha256Bytes,
  tsnClaimIntentOnChain,
  tsnCreateIntentOnChain,
  tsnFundCrankerOnChain,
  tsnInitializeCrankerVaultOnChain,
  tsnInitializeMotherEscrowOnChain,
  tsnMigrateMotherEscrowOnChain,
  tsnRegisterCrankerOnChain,
  tsnSetCrankerFundingPolicyOnChain,
  tsnSettleEpochOnChain,
  tsnSubmitProofOnChain,
  tsnWithdrawCrankerFundsOnChain,
} from "../../../tsn/src/blockchain/solana-tsn";