import { createHmac, timingSafeEqual, createHash } from "node:crypto";

import {
  findPaymentByNotificationMessageEventId,
  findPaymentByNotificationMessageId,
  updatePaymentNotificationMessageId,
  updatePaymentNotificationStatus
} from "@/app/db/payments";
import { findUserByPhoneNumber, upsertUserProfile, markUserWhatsAppOptIn, markUserWhatsAppOptOut } from "@/app/db/users";
import { createWhatsAppWebhookEvent } from "@/app/db/whatsapp-webhook-events";
import type { PaymentNotificationStatus } from "@/app/types/payment";
import { issueAuthChallengeToken } from "@/app/lib/auth";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { sendPhoneVerificationOtp } from "@/app/services/phone-verification";
import {
  isTrustLinkOptInMessage,
  isTrustLinkStopMessage,
  sendInvalidSessionMessage,
  sendSessionApprovedMessage,
  sendSessionDeclinedMessage,
  sendSessionReviewRequest,
} from "@/app/services/whatsapp";
import {
  findPendingSessionForPhone,
  findSessionCode,
  markSessionAwaitingConfirmation,
  markSessionDeclined,
  verifySessionCode,
  type SessionCode,
} from "@/app/lib/session-codes";
import { sanitizeUser } from "@/app/services/auth/shared";
import { normalizePhoneNumber } from "@/app/utils/phone";
import { sha256 } from "@/app/utils/hash";

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{
          wa_id?: string;
          profile?: {
            name?: string;
          };
        }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: {
            body?: string;
          };
          button?: {
            text?: string;
          };
          context?: {
            id?: string;
          };
          interactive?: unknown;
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
          conversation?: unknown;
          pricing?: unknown;
          errors?: unknown;
        }>;
      };
    }>;
  }>;
}

type WhatsAppEntry = NonNullable<WhatsAppWebhookPayload["entry"]>[number];
type WhatsAppChange = NonNullable<WhatsAppEntry["changes"]>[number];
type WhatsAppValue = NonNullable<WhatsAppChange["value"]>;
type WhatsAppMessage = NonNullable<WhatsAppValue["messages"]>[number];

function secureCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeNotificationStatus(status: string | undefined): PaymentNotificationStatus | null {
  switch (status) {
    case "sent":
    case "delivered":
    case "read":
    case "failed":
      return status;
    default:
      return null;
  }
}

function parseWhatsAppTimestamp(timestamp: string | undefined): string | null {
  if (!timestamp) {
    return null;
  }

  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp)) {
    return null;
  }

  return new Date(numericTimestamp * 1000).toISOString();
}

function getInboundText(message: WhatsAppMessage) {
  return message.text?.body ?? message.button?.text ?? "";
}

function normalizeReviewAction(message: string) {
  const normalized = message.trim().toUpperCase();

  if (normalized === "APPROVE SESSION") {
    return "approve" as const;
  }

  if (normalized === "DECLINE SESSION") {
    return "decline" as const;
  }

  return null;
}

function formatRequestedAt(value: Date | undefined) {
  const date = value ?? new Date();
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(date);
}

function formatExpiresIn(expiresAt: Date) {
  const remainingMs = Math.max(expiresAt.getTime() - Date.now(), 0);
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  return `${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`;
}

async function ensureSessionUser(
  phoneNumber: string,
  contactName: string | undefined,
) {
  let user = await findUserByPhoneNumber(phoneNumber);

  logger.info("whatsapp.webhook.user_lookup", {
    phoneNumber,
    userFound: !!user,
    userId: user?.id || null,
    userPhone: user?.phone_number || null,
  });

  if (!user) {
    logger.info("whatsapp.webhook.creating_user", {
      phoneNumber,
      contactName,
    });

    const phoneHash = createHash("sha256").update(phoneNumber).digest("hex");

    user = await upsertUserProfile({
      phoneNumber,
      phoneHash,
      displayName: contactName || "TrustLink User",
      handle: `user_${phoneNumber.slice(-8)}`,
      pinHash: "",
    });

    logger.info("whatsapp.webhook.user_created", {
      userId: user?.id || null,
      userPhone: user?.phone_number || null,
    });
  }

  return user;
}

async function completeSessionApproval(
  verifiedSession: SessionCode,
  phoneNumber: string,
  contactName?: string,
) {
  const user = await ensureSessionUser(phoneNumber, contactName);

  logger.info("whatsapp.webhook.issuing_token", {
    userId: user?.id || null,
    userPhone: user?.phone_number || null,
    hasPinHash: !!user?.pin_hash,
  });

  const challengeToken = issueAuthChallengeToken({
    id: user.id,
    phoneNumber: user.phone_number,
    stage: user.pin_hash ? "pin_verify" : "pin_setup",
  });

  try {
    logger.info("whatsapp.webhook.sending_sse_notification", {
      sessionId: verifiedSession.sessionId,
      hasChallengeToken: !!challengeToken,
      userId: user.id,
    });

    const { notifySessionVerification } = await import("@/app/lib/session-events");
    notifySessionVerification(verifiedSession.sessionId, {
      challengeToken,
      user: sanitizeUser(user),
      stage: user.pin_hash ? "pin_verify" : "pin_setup",
    });

    logger.info("whatsapp.webhook.sse_notification_sent", {
      sessionId: verifiedSession.sessionId,
    });
  } catch (error) {
    logger.warn("whatsapp.webhook.push_notification_failed", {
      sessionId: verifiedSession.sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  logger.info("whatsapp.webhook.auth_ready", {
    sessionId: verifiedSession.sessionId,
    userId: user.id,
    phoneNumber,
    challengeToken,
    stage: user.pin_hash ? "pin_verify" : "pin_setup",
  });
}

export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!env.WHATSAPP_APP_SECRET) {
    return true;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex");
  return secureCompare(signatureHeader, `sha256=${expectedSignature}`);
}

async function processInboundMessage(
  value: WhatsAppValue,
  message: WhatsAppMessage,
) {
  const normalizedPhoneNumber = message.from ? normalizePhoneNumber(message.from) : null;
  const inboundText = getInboundText(message);
  const contactName = value?.contacts?.[0]?.profile?.name;

  logger.info("whatsapp.webhook.inbound_received", {
    rawFrom: message.from ?? null,
    normalizedPhoneNumber,
    contactName: contactName ?? null,
    messageId: message.id ?? null,
    type: message.type ?? null,
    text: inboundText || null,
  });

  await createWhatsAppWebhookEvent({
    eventType: "inbound_message",
    messageId: message.id ?? null,
    phoneNumber: normalizedPhoneNumber,
    direction: "inbound",
    payload: {
      metadata: value?.metadata,
      message,
      contacts: value?.contacts,
    },
  });

  if (!normalizedPhoneNumber) {
    return;
  }

  if (isTrustLinkStopMessage(inboundText)) {
    await markUserWhatsAppOptOut({
      phoneNumber: normalizedPhoneNumber,
      optedOutAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
    });

    logger.info("whatsapp.webhook.opt_out_received", {
      phoneNumber: normalizedPhoneNumber,
    });
    return;
  }

  if (isTrustLinkOptInMessage(inboundText)) {
    await markUserWhatsAppOptIn({
      phoneNumber: normalizedPhoneNumber,
      phoneHash: sha256(normalizedPhoneNumber),
      displayName: contactName,
      optedInAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
    });

    await sendPhoneVerificationOtp(normalizedPhoneNumber, "auth");

    logger.info("whatsapp.webhook.opt_in_received", {
      phoneNumber: normalizedPhoneNumber,
    });
    return;
  }

  const reviewAction = normalizeReviewAction(inboundText);
  if (reviewAction) {
    await handleSessionReviewResponse({
      action: reviewAction,
      phoneNumber: normalizedPhoneNumber,
      contactName,
      replyMessageId: message.context?.id ?? null,
    });
    return;
  }

  // Check for session code verification (accept both formats)
  const fullFormatMatch = inboundText.match(/Verify\s+TrustLink Pay\s+Code:\s+(TL[A-Z0-9]{6})/i);
  const codeOnlyMatch = inboundText.match(/^(TL[A-Z0-9]{6})$/i);
  const sessionCodeMatch = fullFormatMatch || codeOnlyMatch;
  
  logger.info("whatsapp.webhook.session_code_check", {
    inboundText,
    hasMatch: !!sessionCodeMatch,
    match: sessionCodeMatch?.[1] || null,
    format: fullFormatMatch ? "full" : codeOnlyMatch ? "code_only" : "none",
  });
  
  if (sessionCodeMatch) {
    const sessionCode = sessionCodeMatch[1];
    logger.info("whatsapp.webhook.session_code_found", {
      sessionCode,
      phoneNumber: normalizedPhoneNumber,
    });
    await handleSessionCodeVerification(sessionCode, normalizedPhoneNumber, contactName);
    return;
  }

  logger.info("whatsapp.webhook.inbound_message", {
    messageId: message.id,
    from: normalizedPhoneNumber,
    type: message.type,
    text: inboundText || null,
  });
}

async function handleSessionCodeVerification(
  sessionCode: string,
  phoneNumber: string,
  contactName?: string
) {
  logger.info("whatsapp.webhook.session_code_verification_attempt", {
    sessionCode,
    phoneNumber,
  });

  const activeSession = await findSessionCode(sessionCode);

  logger.info("whatsapp.webhook.session_code_lookup_result", {
    sessionCode,
    phoneNumber,
    activeSession: !!activeSession,
    sessionId: activeSession?.sessionId || null,
    status: activeSession?.status ?? null,
  });

  if (!activeSession || activeSession.status !== "pending") {
    logger.warn("whatsapp.webhook.session_code_verification_failed", {
      sessionCode,
      phoneNumber,
    });
    await sendInvalidSessionMessage(phoneNumber);
    return;
  }

  const reviewMessage = await sendSessionReviewRequest({
    phoneNumber,
    sessionCode: activeSession.code,
    device: activeSession.requestContext?.device ?? "Web browser",
    location: activeSession.requestContext?.location ?? "Unavailable",
    requestedAt:
      activeSession.requestContext?.requestedAt ??
      formatRequestedAt(activeSession.createdAt),
    expiresIn: formatExpiresIn(activeSession.expiresAt),
  });

  const updatedSession = await markSessionAwaitingConfirmation(
    sessionCode,
    phoneNumber,
    reviewMessage.messageId,
  );

  logger.info("whatsapp.webhook.session_review_requested", {
    sessionCode,
    phoneNumber,
    sessionId: updatedSession?.sessionId ?? activeSession.sessionId,
    reviewMessageId: reviewMessage.messageId,
    skipped: reviewMessage.skipped,
  });
}

async function handleSessionReviewResponse(params: {
  action: "approve" | "decline";
  phoneNumber: string;
  contactName?: string;
  replyMessageId?: string | null;
}) {
  const pendingSession = await findPendingSessionForPhone(
    params.phoneNumber,
    params.replyMessageId,
  );

  if (!pendingSession) {
    logger.warn("whatsapp.webhook.session_review_response_missing", {
      action: params.action,
      phoneNumber: params.phoneNumber,
      replyMessageId: params.replyMessageId ?? null,
    });
    await sendInvalidSessionMessage(params.phoneNumber);
    return;
  }

  if (params.action === "decline") {
    await markSessionDeclined(pendingSession.code, params.phoneNumber);
    await sendSessionDeclinedMessage(params.phoneNumber);
    return;
  }

  const verifiedSession = await verifySessionCode(
    pendingSession.code,
    params.phoneNumber,
  );

  if (!verifiedSession) {
    await sendInvalidSessionMessage(params.phoneNumber);
    return;
  }

  await completeSessionApproval(
    verifiedSession,
    params.phoneNumber,
    params.contactName,
  );
  await sendSessionApprovedMessage(params.phoneNumber);
}

export async function processWhatsAppWebhookPayload(payload: WhatsAppWebhookPayload) {
  logger.info("whatsapp.webhook.payload_received", {
    object: payload.object ?? null,
    entryCount: payload.entry?.length ?? 0,
  });

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        continue;
      }

      const value = change.value;
      if (!value) {
        continue;
      }

      for (const message of value.messages ?? []) {
        await processInboundMessage(value, message);
      }

      for (const status of value.statuses ?? []) {
        let relatedPayment = status.id ? await findPaymentByNotificationMessageId(status.id) : null;

        if (!relatedPayment && status.id) {
          relatedPayment = await findPaymentByNotificationMessageEventId(status.id);

          if (relatedPayment && relatedPayment.notification_message_id !== status.id) {
            relatedPayment =
              (await updatePaymentNotificationMessageId(relatedPayment.id, status.id)) ?? relatedPayment;
          }
        }

        const normalizedStatus = normalizeNotificationStatus(status.status);
        const occurredAt = parseWhatsAppTimestamp(status.timestamp);
        const normalizedPhoneNumber = status.recipient_id
          ? normalizePhoneNumber(status.recipient_id)
          : null;

        await createWhatsAppWebhookEvent({
          eventType: "message_status",
          messageId: status.id ?? null,
          relatedPaymentId: relatedPayment?.id ?? null,
          phoneNumber: normalizedPhoneNumber,
          direction: "outbound",
          status: status.status ?? null,
          payload: {
            metadata: value?.metadata,
            status,
          },
        });

        if (relatedPayment && normalizedStatus) {
          await updatePaymentNotificationStatus(relatedPayment.id, normalizedStatus, occurredAt);
        }

        logger.info("whatsapp.webhook.message_status", {
          messageId: status.id,
          status: status.status,
          recipientId: normalizedPhoneNumber,
          relatedPaymentId: relatedPayment?.id ?? null,
          normalizedStatus,
          occurredAt,
        });
      }
    }
  }
}
