import { findPaymentById, markPaymentRefundClaimed, updatePaymentStatus } from "@/app/db/payments";
import { findUserByPhoneNumber } from "@/app/db/users";
import { markPaymentExpiredOnChain, prepareExpiredRefundClaim } from "@/app/blockchain/solana";
import type { AuthenticatedUser } from "@/app/types/auth";
import { verifyUserActionPin } from "@/app/services/auth";

async function ensureExpired(paymentId: string, currentStatus: string, expiryAt?: string | null) {
  if (currentStatus === "expired") {
    return await findPaymentById(paymentId);
  }

  if (currentStatus !== "locked") {
    throw new Error(`Payment is already ${currentStatus}`);
  }

  if (!expiryAt || new Date(expiryAt).getTime() > Date.now()) {
    throw new Error("Sender refunds are only available after the payment expiry window");
  }

  await markPaymentExpiredOnChain({ paymentId });
  return (await updatePaymentStatus(paymentId, "expired")) ?? (await findPaymentById(paymentId));
}

export async function requestPaymentRefund(params: {
  authUser: AuthenticatedUser;
  paymentId: string;
  pin: string;
  blockchainSignature?: string;
}) {
  const payment = await findPaymentById(params.paymentId);
  if (!payment) {
    throw new Error("Payment not found");
  }

  if (payment.sender_user_id !== params.authUser.id) {
    throw new Error("Only the original sender can start a sender refund");
  }

  await verifyUserActionPin(params.authUser, params.pin);
  const expiredPayment = await ensureExpired(payment.id, payment.status, payment.expiry_at);

  if (!expiredPayment) {
    throw new Error("Payment not found after expiry transition");
  }

  return {
    payment: expiredPayment,
    refundClaimAvailableAt: expiredPayment.expiry_at ?? null,
    blockchain: {
      signature: null,
      mode: "devnet" as const,
    },
  };
}

export async function claimPaymentRefund(params: {
  authUser: AuthenticatedUser;
  paymentId: string;
  pin: string;
  walletAddress?: string;
  derivedPaymentReceiverPublicKey?: string;
  privacySpendSignature?: string;
  blockchainSignature?: string;
}) {
  const payment = await findPaymentById(params.paymentId);
  if (!payment) {
    throw new Error("Payment not found");
  }

  if (payment.sender_user_id !== params.authUser.id) {
    throw new Error("Only the original sender can reclaim this expired escrow");
  }

  await verifyUserActionPin(params.authUser, params.pin);

  const expiredPayment = await ensureExpired(payment.id, payment.status, payment.expiry_at);
  if (!expiredPayment) {
    throw new Error("Payment not found after expiry transition");
  }

  const sender = await findUserByPhoneNumber(params.authUser.phoneNumber);
  const senderWalletAddress = expiredPayment.sender_wallet ?? sender?.wallet_address ?? undefined;
  if (!senderWalletAddress) {
    throw new Error("Sender wallet not found");
  }

  if (params.walletAddress && params.walletAddress !== senderWalletAddress) {
    throw new Error(`Expired refunds must return to the original sender wallet ${senderWalletAddress}`);
  }

  if (!params.blockchainSignature) {
    const prepared = await prepareExpiredRefundClaim({
      paymentId: expiredPayment.id,
      escrowAccount: expiredPayment.escrow_account ?? "",
      escrowVaultAddress: expiredPayment.escrow_vault_address ?? "",
      senderWallet: senderWalletAddress,
      tokenMintAddress: expiredPayment.token_mint_address ?? "",
      amount: Number(expiredPayment.amount),
    });

    return {
      payment: expiredPayment,
      blockchain: {
        ...prepared,
        signature: null,
      },
      requiresClientSignature: true as const,
      walletAddress: senderWalletAddress,
    };
  }

  const updatedPayment = await markPaymentRefundClaimed({
    id: expiredPayment.id,
    refundReleaseSignature: params.blockchainSignature,
    releasedToWallet: senderWalletAddress,
  });

  return {
    payment: updatedPayment ?? expiredPayment,
    blockchain: {
      signature: params.blockchainSignature,
      mode: "devnet" as const,
    },
    walletAddress: senderWalletAddress,
  };
}
