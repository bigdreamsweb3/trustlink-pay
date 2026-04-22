import {
  createPaymentRecord,
  findPaymentByDepositSignature,
  listExpiredPendingPayments,
  updatePaymentExpiredToPool,
} from "@/app/db/payments";
import { findUserByPhoneNumber } from "@/app/db/users";
import {
  confirmEscrowPayment,
  createDraftPaymentId,
  estimateSenderTransferCost,
  expireEscrowPayment,
  prepareEscrowPayment,
} from "@/app/blockchain/solana";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { sha256 } from "@/app/utils/hash";
import { generatePaymentReference } from "@/app/utils/reference";
import type { PaymentRecord } from "@/app/types/payment";
import { verifyWhatsAppNumber } from "@/app/services/whatsapp-number-verification";

import { requiresManualInvite } from "./invite";
import {
  resolveManualInviteState,
  retryPaymentNotificationIfNeeded,
  sendInitialPaymentNotification,
} from "./notifications";

function buildDuplicateCreateResponse(
  payment: PaymentRecord,
  manualInviteState: Awaited<ReturnType<typeof resolveManualInviteState>>,
  fallbackEscrow?: { escrowAccount: string; escrowVaultAddress: string; signature: string },
) {
  return {
    payment,
    blockchain: {
      escrowAccount: payment.escrow_account ?? fallbackEscrow?.escrowAccount ?? "",
      escrowVaultAddress: payment.escrow_vault_address ?? fallbackEscrow?.escrowVaultAddress ?? null,
      signature: payment.deposit_signature ?? fallbackEscrow?.signature ?? null,
      mode: env.SOLANA_MOCK_MODE ? "mock" : "devnet",
    },
    paymentId: payment.id,
    tokenSymbol: payment.token_symbol,
    senderFeeAmount: Number(payment.sender_fee_amount ?? 0),
    totalTokenRequiredAmount: Number(payment.amount) + Number(payment.sender_fee_amount ?? 0),
    notificationRetried:
      !manualInviteState.manualInviteRequired &&
      (payment.notification_status === "queued" || payment.notification_status === "failed"),
    manualInviteRequired: manualInviteState.manualInviteRequired,
    inviteShare: manualInviteState.inviteShare,
  };
}

export async function createPayment(params: {
  paymentId?: string;
  phoneNumber: string;
  senderPhoneNumber: string;
  amount: number;
  tokenMintAddress: string;
  senderWallet: string;
  escrowVaultAddress?: string;
  depositSignature?: string;
  skipWhatsAppCheck?: boolean;
}) {
  logger.info("payment.create.started", {
    phoneNumber: params.phoneNumber,
    amount: params.amount,
    tokenMintAddress: params.tokenMintAddress,
    senderWallet: params.senderWallet,
  });

  const sender = await findUserByPhoneNumber(params.senderPhoneNumber);
  if (!sender) {
    throw new Error("Sender must register a TrustLink identity before creating payments");
  }

  const whatsappVerification = await verifyWhatsAppNumber(params.phoneNumber);
  if (!whatsappVerification.exists && !params.skipWhatsAppCheck) {
    throw new Error("Receiver phone number is not available on WhatsApp");
  }

  if (params.depositSignature) {
    const existingPayment = await findPaymentByDepositSignature(params.depositSignature);

    if (existingPayment) {
      const manualInviteState = await resolveManualInviteState(existingPayment);
      const updatedPayment = manualInviteState.manualInviteRequired
        ? manualInviteState.payment
        : await retryPaymentNotificationIfNeeded(existingPayment);

      logger.info("payment.create.duplicate_deposit_signature", {
        paymentId: existingPayment.id,
        depositSignature: params.depositSignature,
      });

      return buildDuplicateCreateResponse(updatedPayment, manualInviteState);
    }
  }

  const phoneHash = sha256(params.phoneNumber);
  const paymentId = params.paymentId ?? createDraftPaymentId();

  if (!params.depositSignature) {
    const prepared = await prepareEscrowPayment({
      paymentId,
      senderWallet: params.senderWallet,
      phoneHash,
      amount: params.amount,
      tokenMintAddress: params.tokenMintAddress,
    });

    return {
      payment: null,
      blockchain: {
        escrowAccount: prepared.escrowAccount,
        escrowVaultAddress: prepared.escrowVaultAddress,
        signature: null,
        mode: prepared.mode,
        serializedTransaction: prepared.serializedTransaction,
      },
      paymentId,
      tokenSymbol: prepared.tokenSymbol,
      senderFeeAmount: prepared.senderFeeAmountUi,
      totalTokenRequiredAmount: prepared.totalTokenRequiredUi,
      notificationRetried: false,
      manualInviteRequired: false,
      inviteShare: null,
    };
  }

  if (!params.escrowVaultAddress) {
    throw new Error("escrowVaultAddress is required when finalizing an on-chain payment");
  }

  const manualInviteRequired = await requiresManualInvite(params.phoneNumber);
  const escrow = await confirmEscrowPayment({
    paymentId,
    senderWallet: params.senderWallet,
    phoneHash,
    amount: params.amount,
    tokenMintAddress: params.tokenMintAddress,
    depositSignature: params.depositSignature,
    escrowVaultAddress: params.escrowVaultAddress,
  });

  let payment: PaymentRecord;

  try {
    payment = await createPaymentRecord({
      id: paymentId,
      senderUserId: sender.id,
      senderWallet: params.senderWallet,
      senderDisplayNameSnapshot: sender.display_name,
      senderHandleSnapshot: sender.trustlink_handle,
      referenceCode: generatePaymentReference(),
      receiverPhone: params.phoneNumber,
      receiverPhoneHash: phoneHash,
      tokenSymbol: escrow.tokenSymbol,
      tokenMintAddress: params.tokenMintAddress,
      amount: params.amount,
      senderFeeAmount: escrow.senderFeeAmountUi,
      claimFeeAmount: escrow.claimFeeAmountUi,
      escrowAccount: escrow.escrowAccount,
      escrowVaultAddress: escrow.escrowVaultAddress,
      depositSignature: escrow.signature,
      expiryAt: escrow.expiryAt,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /duplicate key|deposit_signature|idx_payments_deposit_signature/i.test(error.message)
    ) {
      const existingPayment = await findPaymentByDepositSignature(params.depositSignature);

      if (existingPayment) {
        const manualInviteState = await resolveManualInviteState(existingPayment);
        const updatedPayment = manualInviteState.manualInviteRequired
          ? manualInviteState.payment
          : await retryPaymentNotificationIfNeeded(existingPayment);

        logger.info("payment.create.duplicate_deposit_signature_race", {
          paymentId: existingPayment.id,
          depositSignature: params.depositSignature,
        });

        return buildDuplicateCreateResponse(updatedPayment, manualInviteState, {
          escrowAccount: escrow.escrowAccount,
          escrowVaultAddress: escrow.escrowVaultAddress,
          signature: escrow.signature,
        });
      }
    }

    throw error;
  }

  const manualInviteState = manualInviteRequired
    ? await resolveManualInviteState(payment)
    : {
        manualInviteRequired: false,
        payment: await sendInitialPaymentNotification(payment),
        inviteShare: null,
      };
  const updatedPayment = manualInviteState.payment;

  logger.info("payment.create.succeeded", {
    paymentId: payment.id,
    escrowAccount: payment.escrow_account,
    status: updatedPayment?.status,
    notificationMessageId: updatedPayment?.notification_message_id ?? null,
    referenceCode: payment.reference_code,
  });

  return {
    payment: updatedPayment ?? payment,
    blockchain: escrow,
    paymentId: (updatedPayment ?? payment).id,
    tokenSymbol: (updatedPayment ?? payment).token_symbol,
    senderFeeAmount: Number((updatedPayment ?? payment).sender_fee_amount ?? escrow.senderFeeAmountUi ?? 0),
    totalTokenRequiredAmount:
      Number((updatedPayment ?? payment).amount) +
      Number((updatedPayment ?? payment).sender_fee_amount ?? escrow.senderFeeAmountUi ?? 0),
    notificationRetried:
      !manualInviteState.manualInviteRequired &&
      (updatedPayment.notification_status === "queued" || updatedPayment.notification_status === "failed"),
    manualInviteRequired: manualInviteState.manualInviteRequired,
    inviteShare: manualInviteState.inviteShare,
  };
}

export async function estimatePaymentTransfer(params: {
  phoneNumber: string;
  senderPhoneNumber: string;
  amount: number;
  tokenMintAddress: string;
  senderWallet: string;
}) {
  const sender = await findUserByPhoneNumber(params.senderPhoneNumber);
  if (!sender) {
    throw new Error("Sender must register a TrustLink identity before estimating payments");
  }

  const paymentId = createDraftPaymentId();
  const phoneHash = sha256(params.phoneNumber);
  const estimate = await estimateSenderTransferCost({
    paymentId,
    senderWallet: params.senderWallet,
    phoneHash,
    amount: params.amount,
    tokenMintAddress: params.tokenMintAddress,
  });

  return {
    paymentId,
    estimate,
  };
}

export async function expirePendingPayments(limit = 100) {
  const expiredPayments = await listExpiredPendingPayments(limit);
  const results: Array<{
    paymentId: string;
    signature: string | null;
    recoveryWalletAddress: string;
  }> = [];

  for (const payment of expiredPayments) {
    if (!payment.escrow_account || !payment.escrow_vault_address || !payment.token_mint_address) {
      logger.warn("payment.expire.skipped_missing_blockchain_fields", {
        paymentId: payment.id,
      });
      continue;
    }

    const expired = await expireEscrowPayment({
      paymentId: payment.id,
      escrowAccount: payment.escrow_account,
      escrowVaultAddress: payment.escrow_vault_address,
      tokenMintAddress: payment.token_mint_address,
    });

    await updatePaymentExpiredToPool({
      id: payment.id,
      expirySignature: expired.signature,
      recoveryWalletAddress: expired.recoveryWalletAddress,
    });

    results.push({
      paymentId: payment.id,
      signature: expired.signature,
      recoveryWalletAddress: expired.recoveryWalletAddress,
    });
  }

  return {
    processed: results.length,
    payments: results,
  };
}
