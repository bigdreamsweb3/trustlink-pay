import { findPaymentById } from "@/app/db/payments";
import { findReceiverWalletById } from "@/app/db/receiver-wallets";
import { findUserByPhoneNumber, updateUserWallet } from "@/app/db/users";
import {
  estimateClaimFee,
  getIdentityBindingState,
  markPaymentExpiredOnChain,
  prepareEscrowClaim,
} from "@/app/blockchain/solana";
import { markPaymentClaimed, updatePaymentStatus } from "@/app/db/payments";
import { logger } from "@/app/lib/logger";
import { verifyClaimProof } from "@/app/lib/privacy-keys";
import { getTransactionExplorerUrl } from "@/app/utils/blockchain-explorer";
import { sha256 } from "@/app/utils/hash";
import type { AuthenticatedUser } from "@/app/types/auth";
import { verifyUserActionPin } from "@/app/services/auth";
import { sendPaymentClaimedMessage } from "@/app/services/whatsapp";

function paymentCanStillBeClaimed(status: string) {
  return status === "locked" || status === "expired";
}

function resolveClaimMode(payment: { payment_mode?: string | null }) {
  return payment.payment_mode === "invite" ? "invite" : "secure";
}

export async function estimatePaymentClaim(params: {
  authUser: AuthenticatedUser;
  paymentId: string;
  walletAddress?: string;
  receiverWalletId?: string;
}) {
  const payment = await findPaymentById(params.paymentId);

  if (!payment) {
    throw new Error("Payment not found");
  }

  if (!paymentCanStillBeClaimed(payment.status)) {
    throw new Error(`Payment is already ${payment.status}`);
  }

  const activePayment =
    payment.status === "locked" && payment.expiry_at && new Date(payment.expiry_at).getTime() < Date.now()
      ? ((await markPaymentExpiredOnChain({ paymentId: payment.id }), await updatePaymentStatus(payment.id, "expired")) ??
          ({ ...payment, status: "expired" } as typeof payment))
      : payment;

  if (activePayment.receiver_phone !== params.authUser.phoneNumber) {
    throw new Error("Signed-in account does not match payment receiver");
  }

  const existingUser = await findUserByPhoneNumber(params.authUser.phoneNumber);
  if (!existingUser || existingUser.id !== params.authUser.id) {
    throw new Error("Receiver must register a TrustLink identity before estimating claim");
  }
  if (!existingUser.phone_identity_pubkey || !existingUser.privacy_spend_pubkey) {
    throw new Error("Receiver must register secure privacy keys before claiming");
  }

  const requestedSettlementWalletAddress =
    params.receiverWalletId != null
      ? (await findReceiverWalletById(params.receiverWalletId, existingUser.id))?.wallet_address
      : params.walletAddress ?? existingUser.wallet_address ?? undefined;

  const paymentPhoneIdentityPublicKey = activePayment.phone_identity_pubkey ?? existingUser.phone_identity_pubkey;
  const bindingPhoneIdentityPublicKey = existingUser.phone_identity_pubkey;
  const paymentReceiverPublicKey = activePayment.payment_receiver_pubkey;
  const paymentMode = resolveClaimMode(activePayment);
  const binding = await getIdentityBindingState(bindingPhoneIdentityPublicKey);
  if (!requestedSettlementWalletAddress && !binding) {
    throw new Error("Receiver wallet not found");
  }
  const settlementWalletAddress = binding?.settlementWallet ?? requestedSettlementWalletAddress;
  if (!settlementWalletAddress) {
    throw new Error("Receiver wallet not found");
  }
  if (binding && requestedSettlementWalletAddress && binding.settlementWallet !== requestedSettlementWalletAddress) {
    throw new Error(`This TrustLink identity is already bound to ${binding.settlementWallet}`);
  }
  const recoveryWalletAddress = binding?.recoveryWallet ?? null;

  const estimate = await estimateClaimFee({
    paymentId: payment.id,
    escrowAccount: activePayment.escrow_account ?? "",
    escrowVaultAddress: activePayment.escrow_vault_address ?? "",
    receiverWallet: settlementWalletAddress,
    paymentPhoneIdentityPublicKey,
    bindingPhoneIdentityPublicKey,
    paymentReceiverPublicKey: paymentReceiverPublicKey ?? null,
    paymentMode,
    tokenMintAddress: activePayment.token_mint_address ?? "",
    amount: Number(activePayment.amount),
    recoveryWallet: recoveryWalletAddress,
  });

  return {
    payment: activePayment,
    settlementWalletAddress,
    paymentReceiverPublicKey,
    estimate,
  };
}

export async function acceptPayment(params: {
  authUser: AuthenticatedUser;
  paymentId: string;
  pin: string;
  walletAddress?: string;
  receiverWalletId?: string;
  derivedPaymentReceiverPublicKey?: string;
  privacySpendSignature?: string;
  blockchainSignature?: string;
}) {
  logger.info("payment.accept.started", {
    paymentId: params.paymentId,
    phoneNumber: params.authUser.phoneNumber,
    walletAddress: params.walletAddress ?? params.receiverWalletId,
  });

  const payment = await findPaymentById(params.paymentId);

  if (!payment) {
    throw new Error("Payment not found");
  }

  if (!paymentCanStillBeClaimed(payment.status)) {
    throw new Error(`Payment is already ${payment.status}`);
  }

  const activePayment =
    payment.status === "locked" && payment.expiry_at && new Date(payment.expiry_at).getTime() < Date.now()
      ? ((await markPaymentExpiredOnChain({ paymentId: payment.id }), await updatePaymentStatus(payment.id, "expired")) ??
          ({ ...payment, status: "expired" } as typeof payment))
      : payment;

  if (activePayment.receiver_phone !== params.authUser.phoneNumber) {
    throw new Error("Signed-in account does not match payment receiver");
  }

  const phoneHash = sha256(params.authUser.phoneNumber);
  const existingUser = await findUserByPhoneNumber(params.authUser.phoneNumber);
  if (!existingUser) {
    throw new Error("Receiver must register a TrustLink identity before accepting payments");
  }
  const paymentMode = resolveClaimMode(activePayment);
  const isSecurePayment = paymentMode === "secure";
  if (!existingUser.phone_identity_pubkey || !existingUser.privacy_spend_pubkey) {
    throw new Error("Receiver must register secure privacy keys before claiming");
  }
  if (isSecurePayment && (!activePayment.payment_receiver_pubkey || !activePayment.ephemeral_pubkey)) {
    throw new Error("Secure privacy claim data is missing for this payment");
  }

  if (existingUser.id !== params.authUser.id) {
    throw new Error("Signed-in account does not match payment receiver");
  }

  await verifyUserActionPin(params.authUser, params.pin);

  const requestedSettlementWalletAddress =
    params.receiverWalletId != null
      ? (await findReceiverWalletById(params.receiverWalletId, existingUser.id))?.wallet_address
      : params.walletAddress ?? existingUser.wallet_address ?? undefined;

  const paymentPhoneIdentityPublicKey = activePayment.phone_identity_pubkey ?? existingUser.phone_identity_pubkey;
  const bindingPhoneIdentityPublicKey = existingUser.phone_identity_pubkey;
  const binding = await getIdentityBindingState(bindingPhoneIdentityPublicKey);
  if (!requestedSettlementWalletAddress && !binding) {
    throw new Error("Receiver wallet not found");
  }
  const settlementWalletAddress = binding?.settlementWallet ?? requestedSettlementWalletAddress;
  if (!settlementWalletAddress) {
    throw new Error("Receiver wallet not found");
  }
  if (binding && requestedSettlementWalletAddress && binding.settlementWallet !== requestedSettlementWalletAddress) {
    throw new Error(`This TrustLink identity is already bound to ${binding.settlementWallet}`);
  }
  const recoveryWalletAddress = binding?.recoveryWallet ?? null;

  if (isSecurePayment) {
    if (params.derivedPaymentReceiverPublicKey !== activePayment.payment_receiver_pubkey) {
      throw new Error("Derived receiver key mismatch detected");
    }

    if (!params.privacySpendSignature) {
      throw new Error("Missing privacy ownership proof");
    }
    const proofValid = verifyClaimProof({
      privacySpendPublicKey: existingUser.privacy_spend_pubkey,
      privacySpendSignature: params.privacySpendSignature,
      paymentId: payment.id,
      phoneIdentityPublicKey: paymentPhoneIdentityPublicKey,
      paymentReceiverPublicKey: activePayment.payment_receiver_pubkey!,
      ephemeralPublicKey: activePayment.ephemeral_pubkey!,
      settlementWalletPublicKey: settlementWalletAddress,
    });
    if (!proofValid) {
      throw new Error("Privacy ownership proof is invalid");
    }
  }

  const user =
    existingUser.wallet_address === settlementWalletAddress
      ? existingUser
      : await updateUserWallet({
          phoneNumber: params.authUser.phoneNumber,
          phoneHash,
          walletAddress: settlementWalletAddress,
          markPhoneVerified: true,
        });

  const release = await prepareEscrowClaim({
    paymentId: payment.id,
    escrowAccount: activePayment.escrow_account ?? "",
    escrowVaultAddress: activePayment.escrow_vault_address ?? "",
    receiverWallet: settlementWalletAddress,
    paymentPhoneIdentityPublicKey,
    bindingPhoneIdentityPublicKey,
    paymentReceiverPublicKey: isSecurePayment ? activePayment.payment_receiver_pubkey : null,
    paymentMode,
    tokenMintAddress: activePayment.token_mint_address ?? "",
    amount: Number(activePayment.amount),
    recoveryWallet: recoveryWalletAddress,
  });

  if (!params.blockchainSignature) {
    return {
      payment: activePayment,
      user,
      blockchain: {
        ...release,
        signature: null,
      },
      requiresClientSignature: true,
    };
  }

  const updatedPayment = await markPaymentClaimed({
    id: activePayment.id,
    releaseSignature: params.blockchainSignature,
    releasedToWallet: settlementWalletAddress,
    claimFeeAmount: release.feeAmountUi,
  });
  const transactionUrl = getTransactionExplorerUrl({
    chain: "solana",
        signature: params.blockchainSignature,
  });

  try {
    await sendPaymentClaimedMessage({
      phoneNumber: params.authUser.phoneNumber,
      referenceCode: payment.reference_code,
      amount: Number(payment.amount),
      token: activePayment.token_symbol,
      walletAddress: settlementWalletAddress,
      senderDisplayName: activePayment.sender_display_name_snapshot,
      senderHandle: activePayment.sender_handle_snapshot,
      transactionUrl,
    });
  } catch (error) {
    logger.warn("payment.claimed_notification_failed", {
      paymentId: payment.id,
      phoneNumber: params.authUser.phoneNumber,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  logger.info("payment.accept.succeeded", {
      paymentId: activePayment.id,
      settlementWalletAddress,
      paymentReceiverPublicKey: activePayment.payment_receiver_pubkey,
      status: updatedPayment?.status,
  });

  return {
    payment: updatedPayment,
    user,
    blockchain: {
      signature: params.blockchainSignature,
      mode: release.mode,
      feeAmountUi: release.feeAmountUi,
      preview: release.preview,
    },
  };
}

export async function startPaymentClaim(params: {
  paymentId: string;
  authUser: AuthenticatedUser;
}) {
  const payment = await findPaymentById(params.paymentId);

  if (!payment) {
    throw new Error("Payment not found");
  }

  if (!paymentCanStillBeClaimed(payment.status)) {
    throw new Error(`Payment is already ${payment.status}`);
  }

  if (payment.receiver_phone !== params.authUser.phoneNumber) {
    throw new Error("Signed-in account does not match payment receiver");
  }

  const user = await findUserByPhoneNumber(params.authUser.phoneNumber);

  if (!user) {
    throw new Error("Receiver must register a TrustLink identity before claiming");
  }

  return {
    paymentId: payment.id,
    referenceCode: payment.reference_code,
    senderDisplayName: payment.sender_display_name_snapshot,
    senderHandle: payment.sender_handle_snapshot,
    expiresAt: null,
  };
}
