import { findPaymentById } from "@/app/db/payments";
import { findUserById } from "@/app/db/users";
import { listWhatsAppWebhookEventsByPaymentId } from "@/app/db/whatsapp-webhook-events";
import {
  buildInviteShareData,
  requiresManualInvite,
  retryPaymentNotificationIfNeeded,
} from "@/app/services/payments";
import type { AuthenticatedUser } from "@/app/types/auth";
import type { PaymentRecord, PaymentViewerRole } from "@/app/types/payment";
import { getTransactionExplorerUrl } from "@/app/utils/blockchain-explorer";

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
  const timeline = [
    {
      id: "created",
      label: "Payment created",
      description: "TrustLink created the escrow payment and issued the reference.",
      occurredAt: payment.created_at,
      complete: true
    },
    {
      id: manualInviteRequired ? "invite_needed" : "sent",
      label: manualInviteRequired ? "Sender invite needed" : "WhatsApp sent",
      description: manualInviteRequired
        ? "This recipient is not yet onboarded for TrustLink secure claiming, so the payment stays in invite escrow until onboarding completes or the sender later starts a refund."
        : "TrustLink pushed the payment notice through its shared verified WhatsApp channel.",
      occurredAt: manualInviteRequired ? payment.created_at : payment.notification_sent_at,
      complete: manualInviteRequired || payment.notification_status !== "queued"
    },
    {
      id: "delivered",
      label: manualInviteRequired ? "Recipient onboarded" : "WhatsApp delivered",
      description: manualInviteRequired
        ? "Once the recipient joins TrustLink and completes secure setup, the same escrowed payment becomes claimable inside the app."
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
      label: "Claim completed",
      description: "TrustLink released the escrow after claim verification succeeded.",
      occurredAt: payment.release_signature ? payment.created_at : null,
      complete: payment.status === "claimed"
    }
  ];

  if (payment.status === "refund_requested") {
    timeline.push({
      id: "refund_requested",
      label: "Refund waiting period",
      description:
        "The sender requested a refund. TrustLink gives the recipient a final response window before the sender can claim the refund escrow back.",
      occurredAt: payment.refund_requested_at ?? payment.expiry_at ?? null,
      complete: true,
    });
  }

  if (payment.status === "expired") {
    timeline.push({
      id: "expired",
      label: "Escrow expired",
      description:
        "The claim window elapsed, but the funds remain in the original program vault. The recipient can still late-claim, or the sender can reclaim the escrow back on-chain.",
      occurredAt: payment.expiry_at ?? null,
      complete: true,
    });
  }

  if (payment.status === "refunded") {
    timeline.push({
      id: "refunded",
      label: "Refund claimed",
      description:
        "The sender completed the refund flow and claimed the expired invite payment back into their wallet.",
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

  const payment = await retryPaymentNotificationIfNeeded(paymentRecord, appBaseUrl);
  const manualInviteRequired = await requiresManualInvite(payment.receiver_phone);
  const inviteShare = manualInviteRequired ? buildInviteShareData(payment, appBaseUrl) : null;
  const recipientOnboarded = payment.receiver_onboarded ?? !manualInviteRequired;

  const viewerRole = getViewerRole(payment, authUser);

  if (!viewerRole) {
    throw new Error("You are not allowed to view this payment");
  }

  const [senderUser, webhookEvents] = await Promise.all([
    payment.sender_user_id ? findUserById(payment.sender_user_id) : Promise.resolve(null),
    listWhatsAppWebhookEventsByPaymentId(paymentId)
  ]);

  const safePayment = sanitizePaymentForViewer(
    {
      ...payment,
      manual_invite_required: manualInviteRequired,
      invite_share: inviteShare,
      receiver_onboarded: recipientOnboarded,
    },
    authUser,
  );
  const depositExplorerUrl = safePayment.deposit_signature
    ? getTransactionExplorerUrl({ chain: "solana", signature: safePayment.deposit_signature })
    : null;
  const releaseExplorerUrl = safePayment.release_signature
    ? getTransactionExplorerUrl({ chain: "solana", signature: safePayment.release_signature })
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
      releasedWallet: viewerRole === "receiver" ? payment.released_to_wallet : safePayment.released_to_wallet,
      claimReady: (payment.status === "locked" || payment.status === "expired") && viewerRole === "receiver",
      onboarded: recipientOnboarded,
      manualInviteRequired: viewerRole === "sender" ? manualInviteRequired : false,
      inviteShare: viewerRole === "sender" ? inviteShare : null,
    },
    trace: {
      paymentId: payment.id,
      escrowAccount: payment.escrow_account,
      depositSignature: safePayment.deposit_signature,
      depositExplorerUrl,
      releaseSignature: payment.release_signature,
      releaseExplorerUrl,
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
