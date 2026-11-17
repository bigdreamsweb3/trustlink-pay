import { findPaymentById } from "@/app/db/payments";
import { findUserById, findUserByPhoneNumber } from "@/app/db/users";
import { listWhatsAppWebhookEventsByPaymentId } from "@/app/db/whatsapp-webhook-events";
import {
  retryPaymentNotificationIfNeeded,
} from "@/app/services/payments";
import {
  buildInviteShareData,
  requiresManualInvite,
} from "@/app/services/payments/invite";
import { getTransactionExplorerUrl } from "@/app/utils/blockchain-explorer";
import { env } from "@/app/lib/env";
import type { AuthenticatedUser } from "@/app/types/auth";
import type { PaymentRecord, PaymentTsnState, PaymentViewerRole } from "@/app/types/payment";
import { enrichPaymentsWithTsnState, syncPaymentIntentTraceFromMempool } from "@/app/services/tsn";

function getViewerRole(payment: PaymentRecord, authUser: AuthenticatedUser): PaymentViewerRole | null {
  if (payment.sender_user_id === authUser.id) {
    return "sender";
  }

  if (payment.receiver_phone === authUser.phoneNumber) {
    return "receiver";
  }

  return null;
}

function maskPhoneNumber(phoneNumber: string) {
  if (!phoneNumber) {
    return null;
  }

  const visiblePrefixLength = phoneNumber.startsWith("+")
    ? Math.min(4, Math.max(2, phoneNumber.length - 2))
    : Math.min(3, Math.max(1, phoneNumber.length - 2));
  const prefix = phoneNumber.slice(0, visiblePrefixLength);
  const suffix = phoneNumber.slice(-2);

  return `${prefix}${"*".repeat(Math.max(2, phoneNumber.length - visiblePrefixLength - 2))}${suffix}`;
}

function maskWalletAddress(walletAddress: string | null) {
  if (!walletAddress) {
    return null;
  }

  if (walletAddress.length <= 10) {
    return walletAddress;
  }

  return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
}

function buildTimeline(payment: PaymentRecord, manualInviteRequired: boolean) {
  const tsnState = payment.tsn as PaymentTsnState | undefined;
  const isTsnPaid = Boolean(
    payment.status === "claimed" ||
      (tsnState && (tsnState.stage === "cranker_paid" || tsnState.stage === "epoch_settled")),
  );
  const isTsnFunded = Boolean(tsnState && ["funded", "lease_claimed", "cranker_paid", "epoch_settled"].includes(tsnState.stage));
  const isTsnLeased = Boolean(
    tsnState && ["lease_claimed", "cranker_paid", "epoch_settled"].includes(tsnState.stage),
  );

  const timeline = [
    {
      id: "created",
      label: "Payment created",
      description: "TrustLink created the payment intent and issued the reference.",
      occurredAt: payment.created_at,
      complete: true
    },
    {
      id: manualInviteRequired ? "invite_needed" : "sent",
      label: manualInviteRequired ? "Sender invite needed" : "WhatsApp sent",
      description: manualInviteRequired
        ? "This recipient is not yet onboarded, so the payment remains pending in the epoch liability ledger until settlement or refund."
        : "TrustLink pushed the payment notice through its shared verified WhatsApp channel.",
      occurredAt: manualInviteRequired ? payment.created_at : payment.notification_sent_at,
      complete: manualInviteRequired || payment.notification_status !== "queued"
    },
    {
      id: "delivered",
      label: manualInviteRequired ? "Recipient onboarded" : "WhatsApp delivered",
      description: manualInviteRequired
        ? "Once the recipient joins TrustLink and completes secure setup, the Node can issue a settlement authorization."
        : "The recipient device received the TrustLink payment message.",
      occurredAt: manualInviteRequired ? null : payment.notification_delivered_at,
      complete: manualInviteRequired ? false : payment.notification_status === "delivered" || payment.notification_status === "read"
    },
    {
      id: "read",
      label: manualInviteRequired ? "Invite confirmed by sender" : "WhatsApp seen",
      description: manualInviteRequired
        ? "The sender can keep nudging the recipient until onboarding completes or the invite expiry window ends."
        : "The recipient opened the TrustLink payment message.",
      occurredAt: manualInviteRequired ? payment.created_at : payment.notification_read_at,
      complete: manualInviteRequired ? true : payment.notification_status === "read"
    },
    {
      id: "claimed",
      label: isTsnPaid ? "Settled" : "Claim completed",
      description: isTsnPaid
        ? "A Cranker paid the recipient and the opaque settlement slot is permanently settled."
        : "TrustLink finalized the settlement after authorization verification succeeded.",
      occurredAt: payment.release_signature ? payment.created_at : null,
      complete: payment.status === "claimed" || isTsnPaid
    }
  ];

  if (env.TSN_ENABLED && tsnState) {
    timeline.splice(4, 0, {
      id: "tsn_authorization",
      label: "Awaiting Cranker",
      description: "TrustLink TSN has queued this payment for Cranker verification and sponsored settlement.",
      occurredAt: null,
      complete: isTsnPaid || tsnState.stage !== "intent_pending",
    });

    timeline.splice(5, 0, {
      id: "tsn_funded",
      label: "Epoch funded",
      description: "Funding increased aggregate epoch liability; no payment-specific account was created.",
      occurredAt: null,
      complete: isTsnFunded,
    });

    timeline.splice(6, 0, {
      id: "tsn_leased",
      label: "Cranker leased",
      description: "A Cranker lease is active so only one operator can complete this recipient payout path.",
      occurredAt: null,
      complete: isTsnLeased,
    });

    timeline.splice(7, 0, {
      id: "tsn_cranker_paid",
      label: "Recipient paid",
      description: "A Cranker paid the recipient from vault liquidity and consumed the Mother-rooted DNA slot.",
      occurredAt: null,
      complete: isTsnPaid,
    });
  }

  if (payment.status === "refund_requested") {
    timeline.push({
      id: "refund_requested",
      label: "Refund waiting period",
      description:
        "The sender requested a refund. TrustLink gives the recipient a final response window before the Node can authorize a refund from epoch treasury liquidity.",
      occurredAt: payment.refund_requested_at ?? payment.expiry_at ?? null,
      complete: true,
    });
  }

  if (payment.status === "expired") {
    timeline.push({
      id: "expired",
      label: "Intent expired",
      description:
        "The intent window elapsed; the Node may issue a refund authorization if the opaque slot remains pending.",
      occurredAt: payment.expiry_at ?? null,
      complete: true,
    });
  }

  if (payment.status === "refunded") {
    timeline.push({
      id: "refunded",
      label: "Refunded",
      description:
        "The Node consumed the opaque slot as REFUNDED and returned the exact amount from the epoch treasury.",
      occurredAt: payment.refund_claimed_at ?? payment.refund_requested_at ?? payment.expiry_at ?? null,
      complete: true,
    });
  }

  return timeline;
}

export function sanitizePaymentForViewer(payment: PaymentRecord, authUser: AuthenticatedUser): PaymentRecord {
  const viewerRole = getViewerRole(payment, authUser);

  if (!viewerRole) {
    throw new Error("You are not allowed to view this payment");
  }

  return {
    ...payment,
    sender_wallet: viewerRole === "sender" ? payment.sender_wallet : null,
    deposit_signature: viewerRole === "sender" ? payment.deposit_signature : null,
    released_to_wallet:
      viewerRole === "receiver" ? payment.released_to_wallet : maskWalletAddress(payment.released_to_wallet),
    viewer_role: viewerRole,
    manual_invite_required: payment.manual_invite_required ?? false,
    invite_share: viewerRole === "sender" ? payment.invite_share ?? null : null,
    receiver_onboarded: payment.receiver_onboarded ?? false,
  };
}

export async function getPaymentDetailForViewer(
  authUser: AuthenticatedUser,
  paymentId: string,
  appBaseUrl?: string | null,
) {
  const paymentRecord = await findPaymentById(paymentId);

  if (!paymentRecord) {
    throw new Error("Payment not found");
  }

  const paymentWithReceipts = await retryPaymentNotificationIfNeeded(paymentRecord, appBaseUrl);
  await syncPaymentIntentTraceFromMempool(paymentWithReceipts.id);
  const payment = (await enrichPaymentsWithTsnState([paymentWithReceipts]))[0];
  const manualInviteRequired = await requiresManualInvite(payment.receiver_phone);
  const inviteShare = manualInviteRequired ? buildInviteShareData(payment, appBaseUrl) : null;
  const recipientOnboarded = payment.receiver_onboarded ?? !manualInviteRequired;

  const viewerRole = getViewerRole(payment, authUser);

  if (!viewerRole) {
    throw new Error("You are not allowed to view this payment");
  }

  const [senderUser, receiverUser, webhookEvents] = await Promise.all([
    payment.sender_user_id ? findUserById(payment.sender_user_id) : Promise.resolve(null),
    findUserByPhoneNumber(payment.receiver_phone),
    listWhatsAppWebhookEventsByPaymentId(paymentId)
  ]);
  const receiverDisplayName =
    receiverUser?.display_name ??
    payment.receiver_display_name ??
    "";
  const receiverHandle = receiverUser?.trustlink_handle ?? payment.receiver_handle ?? null;
  const receiverTin = receiverUser?.tin ?? payment.receiver_tin ?? null;
  const receiverTinsIdentityPublicKey =
    receiverUser?.tins_identity_pubkey ?? payment.receiver_tins_identity_pubkey ?? null;

  const safePayment = sanitizePaymentForViewer(
    {
      ...payment,
      manual_invite_required: manualInviteRequired,
      invite_share: inviteShare,
      receiver_onboarded: recipientOnboarded,
      receiver_display_name: receiverDisplayName,
      receiver_handle: receiverHandle,
      receiver_tin: receiverTin,
      receiver_tins_identity_pubkey: receiverTinsIdentityPublicKey,
    },
    authUser,
  );
  const depositExplorerUrl = safePayment.deposit_signature
    ? getTransactionExplorerUrl({ chain: "solana", signature: safePayment.deposit_signature })
    : null;
  const releaseExplorerUrl = safePayment.release_signature
    ? getTransactionExplorerUrl({ chain: "solana", signature: safePayment.release_signature })
    : null;
  const tsnSettlementExplorerUrl = viewerRole === "receiver" && safePayment.tsn?.settlementTxSig
    ? getTransactionExplorerUrl({ chain: "solana", signature: safePayment.tsn.settlementTxSig })
    : null;
  return {
    payment: safePayment,
    viewerRole,
    sender: {
      displayName: payment.sender_display_name_snapshot,
      handle: payment.sender_handle_snapshot,
      referenceCode: payment.reference_code,
      phoneMasked: viewerRole === "receiver" ? maskPhoneNumber(senderUser?.phone_number ?? "") : null,
      trustVerified: Boolean(senderUser?.phone_verified_at),
      trustStatusLabel: senderUser?.phone_verified_at ? "Verified TrustLink sender" : "TrustLink sender",
      contactShared: false
    },
    receiver: {
      phone: viewerRole === "sender" ? payment.receiver_phone : authUser.phoneNumber,
      displayName: receiverDisplayName,
      handle: receiverHandle,
      tin: receiverTin,
      tinsIdentityPublicKey: receiverTinsIdentityPublicKey,
      releasedWallet: viewerRole === "receiver" ? payment.released_to_wallet : safePayment.released_to_wallet,
      claimReady: (payment.status === "locked" || payment.status === "expired") && viewerRole === "receiver",
      onboarded: recipientOnboarded,
      manualInviteRequired: viewerRole === "sender" ? manualInviteRequired : false,
      inviteShare: viewerRole === "sender" ? inviteShare : null,
    },
    trace: {
      paymentId: payment.id,
      depositSignature: safePayment.deposit_signature,
      depositExplorerUrl,
      releaseSignature: payment.release_signature,
      releaseExplorerUrl,
      tsnSettlementSignature: viewerRole === "receiver" ? safePayment.tsn?.settlementTxSig ?? null : null,
      tsnSettlementExplorerUrl,
      claimed: payment.status === "claimed",
    },
    privacy: {
      senderWalletVisibleToReceiver: false,
      senderPhoneVisibleToReceiver: false,
      senderPhonePolicy:
        "TrustLink does not reveal the sender's full phone number or wallet address to the receiver.",
      deliveryChannelNote:
        "TrustLink sends payment notifications from a shared verified WhatsApp channel on the sender's behalf, so the receiver can trust the payment without seeing the sender's personal WhatsApp number."
    },
    whatsapp: {
      notificationMessageId: payment.notification_message_id,
      status: payment.notification_status,
      sentAt: payment.notification_sent_at,
      deliveredAt: payment.notification_delivered_at,
      readAt: payment.notification_read_at,
      failedAt: payment.notification_failed_at,
      eventCount: webhookEvents.length
    },
    timeline: buildTimeline(payment, manualInviteRequired)
  };
}
