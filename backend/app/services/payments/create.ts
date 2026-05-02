import {
  createPaymentRecord,
  findPaymentByDepositSignature,
} from "@/app/db/payments";
import { ensureUserForPhoneNumber, ensureUserPhoneIdentityPublicKey, findUserByPhoneNumber } from "@/app/db/users";
import {
  confirmEscrowPayment,
  createDraftPaymentId,
  estimateSenderTransferCost,
  prepareEscrowPayment,
} from "@/app/blockchain/solana";
import { getEscrowPolicyConfig } from "@/app/config/escrow";
import { getAllowedTokenByMint } from "@/app/blockchain/solana-core";
import { env } from "@/app/lib/env";
import { deriveStealthPaymentAddress, generatePaymentIdentityPublicKey } from "@/app/lib/privacy-keys";
import { logger } from "@/app/lib/logger";
import { getUsdPricesForSymbols } from "@/app/services/pricing";
import { verifyWhatsAppNumber } from "@/app/services/whatsapp-number-verification";
import type { PaymentRecord } from "@/app/types/payment";
import { sha256 } from "@/app/utils/hash";
import { generatePaymentReference } from "@/app/utils/reference";

import { requiresManualInvite } from "./invite";
import { AutoclaimEngine } from "./autoclaim-engine";
import {
  enforceInvitePaymentCap,
  getInviteExpiryAt,
  hasSecurePrivacyRouting,
} from "./policy";
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

async function resolveInviteEligibility(params: {
  receiverPhone: string;
  receiverPhoneHash: string;
  amount: number;
  tokenMintAddress: string;
  sender: NonNullable<Awaited<ReturnType<typeof findUserByPhoneNumber>>>;
  preparedPhoneIdentityPublicKey?: string;
  preparedPaymentReceiverPublicKey?: string;
  preparedEphemeralPublicKey?: string | null;
}) {
  const receiverUser = await ensureUserForPhoneNumber({
    phoneNumber: params.receiverPhone,
    phoneHash: params.receiverPhoneHash,
  });
  const receiverIdentityPublicKey = await ensureUserPhoneIdentityPublicKey(
    receiverUser.id,
    receiverUser.phone_identity_pubkey,
  );
  const receiverSecure = hasSecurePrivacyRouting({
    phone_identity_pubkey: receiverIdentityPublicKey,
    privacy_view_pubkey: receiverUser.privacy_view_pubkey,
    privacy_spend_pubkey: receiverUser.privacy_spend_pubkey,
  });

  if (receiverSecure) {
    const receiverRouting =
      params.preparedPaymentReceiverPublicKey && params.preparedEphemeralPublicKey
        ? {
            paymentReceiverPublicKey: params.preparedPaymentReceiverPublicKey,
            ephemeralPublicKey: params.preparedEphemeralPublicKey,
          }
        : deriveStealthPaymentAddress({
            receiverViewPublicKey: receiverUser.privacy_view_pubkey!,
            receiverSpendPublicKey: receiverUser.privacy_spend_pubkey!,
          });

    return {
      receiverUser,
      receiverIdentityPublicKey:
        params.preparedPhoneIdentityPublicKey ?? receiverIdentityPublicKey,
      paymentMode: "secure" as const,
      receiverOnboarded: true,
      receiverAutoclaimAllowed: receiverUser.receiver_autoclaim_enabled ?? false,
      receiverWallet: receiverUser.wallet_address ?? null,
      paymentReceiverPublicKey: receiverRouting.paymentReceiverPublicKey,
      ephemeralPublicKey: receiverRouting.ephemeralPublicKey,
      expiryAtOverride: null,
    };
  }

  if (!hasSecurePrivacyRouting(params.sender)) {
    throw new Error("Sender must finish secure wallet setup before sending invite escrow payments");
  }

  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }
  const prices = await getUsdPricesForSymbols([tokenConfig.symbol]);
  const unitPriceUsd = prices[tokenConfig.symbol.toUpperCase()] ?? null;
  const amountUsd = unitPriceUsd != null ? Number((params.amount * unitPriceUsd).toFixed(2)) : null;
  enforceInvitePaymentCap({
    amountUsd,
    tokenSymbol: tokenConfig.symbol,
    amount: params.amount,
  });

  return {
    receiverUser,
    receiverIdentityPublicKey:
      params.preparedPhoneIdentityPublicKey ?? receiverIdentityPublicKey,
    paymentMode: "invite" as const,
    receiverOnboarded: false,
    receiverAutoclaimAllowed: receiverUser.receiver_autoclaim_enabled ?? false,
    receiverWallet: receiverUser.wallet_address ?? null,
    paymentReceiverPublicKey:
      params.preparedPaymentReceiverPublicKey ?? generatePaymentIdentityPublicKey(),
    ephemeralPublicKey: params.preparedEphemeralPublicKey ?? null,
    expiryAtOverride: getInviteExpiryAt().toISOString(),
  };
}

function resolvePaymentExpiryIso(expiryAtOverride: string | null) {
  if (expiryAtOverride) {
    return expiryAtOverride;
  }

  return new Date(Date.now() + getEscrowPolicyConfig().defaultExpirySeconds * 1000).toISOString();
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
  preparedPhoneIdentityPublicKey?: string;
  preparedPaymentReceiverPublicKey?: string;
  preparedEphemeralPublicKey?: string | null;
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
  const receiverPaymentPolicy = await resolveInviteEligibility({
    receiverPhone: params.phoneNumber,
    receiverPhoneHash: phoneHash,
    amount: params.amount,
    tokenMintAddress: params.tokenMintAddress,
    sender,
    preparedPhoneIdentityPublicKey: params.preparedPhoneIdentityPublicKey,
    preparedPaymentReceiverPublicKey: params.preparedPaymentReceiverPublicKey,
    preparedEphemeralPublicKey: params.preparedEphemeralPublicKey,
  });
  const paymentExpiryAt = resolvePaymentExpiryIso(receiverPaymentPolicy.expiryAtOverride);
  const senderPhoneIdentityPublicKey = sender.phone_identity_pubkey;
  if (!senderPhoneIdentityPublicKey) {
    throw new Error("Sender must finish TrustLink identity setup before creating payments");
  }
  const paymentId = params.paymentId ?? createDraftPaymentId();

  if (!params.depositSignature) {
    const prepared = await prepareEscrowPayment({
      paymentId,
      senderWallet: params.senderWallet,
      phoneIdentityPublicKey: receiverPaymentPolicy.receiverIdentityPublicKey,
      paymentReceiverPublicKey: receiverPaymentPolicy.paymentReceiverPublicKey,
      paymentMode: receiverPaymentPolicy.paymentMode,
      amount: params.amount,
      tokenMintAddress: params.tokenMintAddress,
      expiryUnixSeconds: Math.floor(new Date(paymentExpiryAt).getTime() / 1000),
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
      phoneIdentityPublicKey: receiverPaymentPolicy.receiverIdentityPublicKey,
      paymentReceiverPublicKey: receiverPaymentPolicy.paymentReceiverPublicKey,
      ephemeralPublicKey: receiverPaymentPolicy.ephemeralPublicKey,
      tokenSymbol: prepared.tokenSymbol,
      senderFeeAmount: prepared.senderFeeAmountUi,
      totalTokenRequiredAmount: prepared.totalTokenRequiredUi,
      notificationRetried: false,
      manualInviteRequired: receiverPaymentPolicy.paymentMode === "invite",
      inviteShare: null,
    };
  }

  if (!params.escrowVaultAddress) {
    throw new Error("escrowVaultAddress is required when finalizing an on-chain payment");
  }

  const manualInviteRequired =
    receiverPaymentPolicy.paymentMode === "invite" || (await requiresManualInvite(params.phoneNumber));

  const escrow = await confirmEscrowPayment({
    paymentId,
    senderWallet: params.senderWallet,
    phoneIdentityPublicKey: receiverPaymentPolicy.receiverIdentityPublicKey,
    paymentReceiverPublicKey: receiverPaymentPolicy.paymentReceiverPublicKey,
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
      senderPhoneIdentityPublicKey: sender.phone_identity_pubkey ?? null,
      senderDisplayNameSnapshot: sender.display_name,
      senderHandleSnapshot: sender.trustlink_handle,
      referenceCode: generatePaymentReference(),
      receiverPhone: params.phoneNumber,
      receiverPhoneHash: phoneHash,
      paymentMode: receiverPaymentPolicy.paymentMode,
      senderAutoclaimEnabled: true,
      receiverAutoclaimAllowed: receiverPaymentPolicy.receiverAutoclaimAllowed,
      receiverWallet: receiverPaymentPolicy.receiverWallet,
      receiverOnboarded: receiverPaymentPolicy.receiverOnboarded,
      receiverIdentityPublicKey: receiverPaymentPolicy.receiverIdentityPublicKey,
      paymentReceiverPublicKey: receiverPaymentPolicy.paymentReceiverPublicKey,
      ephemeralPublicKey: receiverPaymentPolicy.ephemeralPublicKey,
      tokenSymbol: escrow.tokenSymbol,
      tokenMintAddress: params.tokenMintAddress,
      amount: params.amount,
      senderFeeAmount: escrow.senderFeeAmountUi,
      claimFeeAmount: escrow.claimFeeAmountUi,
      escrowAccount: escrow.escrowAccount,
      escrowVaultAddress: escrow.escrowVaultAddress,
      depositSignature: escrow.signature,
      expiryAt: paymentExpiryAt,
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

  await AutoclaimEngine.triggerPaymentLocked({
    paymentId: payment.id,
    triggerSource: "payment.locked",
  });

  logger.info("payment.create.succeeded", {
    paymentId: payment.id,
    paymentMode: payment.payment_mode,
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
  const receiverPaymentPolicy = await resolveInviteEligibility({
    receiverPhone: params.phoneNumber,
    receiverPhoneHash: phoneHash,
    amount: params.amount,
    tokenMintAddress: params.tokenMintAddress,
    sender,
  });
  const senderPhoneIdentityPublicKey = sender.phone_identity_pubkey;
  if (!senderPhoneIdentityPublicKey) {
    throw new Error("Sender must finish TrustLink identity setup before estimating payments");
  }
  const paymentExpiryAt = resolvePaymentExpiryIso(receiverPaymentPolicy.expiryAtOverride);

  const estimate = await estimateSenderTransferCost({
    paymentId,
    senderWallet: params.senderWallet,
    phoneIdentityPublicKey: receiverPaymentPolicy.receiverIdentityPublicKey,
    paymentReceiverPublicKey: receiverPaymentPolicy.paymentReceiverPublicKey,
    paymentMode: receiverPaymentPolicy.paymentMode,
    amount: params.amount,
    tokenMintAddress: params.tokenMintAddress,
    expiryUnixSeconds: Math.floor(new Date(paymentExpiryAt).getTime() / 1000),
  });

  return {
    paymentId,
    paymentMode: receiverPaymentPolicy.paymentMode,
    inviteExpiryAt: receiverPaymentPolicy.expiryAtOverride,
    estimate,
  };
}

export async function expirePendingPayments(limit = 100) {
  logger.info("payment.expire.sweep_disabled", {
    expiredCandidateCount: 0,
  });

  return {
    processed: 0,
    payments: [],
  };
}
