import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { findUserByPhoneNumber } from "@/app/db/users";
import { normalizePhoneNumber, toWhatsAppRecipient } from "@/app/utils/phone";

interface WhatsAppTemplateComponentParameter {
  type: "text";
  text: string;
}

interface WhatsAppTemplatePayload {
  name: string;
  language: {
    code: string;
  };
  components?: Array<{
    type: "body";
    parameters: WhatsAppTemplateComponentParameter[];
  }>;
}

type SendMessageOptions = {
  bypassOptInCheck?: boolean;
  category?: "auth" | "notification";
};

async function canSendWhatsApp(phoneNumber: string, options?: SendMessageOptions) {
  if (options?.bypassOptInCheck) {
    return true;
  }

  const user = await findUserByPhoneNumber(phoneNumber);
  return Boolean(user?.whatsapp_opted_in);
}

async function sendWhatsAppMessage(
  phoneNumber: string,
  payload: Record<string, unknown>,
  options?: SendMessageOptions,
) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const allowed = await canSendWhatsApp(normalizedPhoneNumber, options);

  if (!allowed) {
    logger.warn("whatsapp.send.skipped_opt_out", {
      phoneNumber: normalizedPhoneNumber,
      category: options?.category ?? "notification",
    });
    return { messageId: null, skipped: true as const };
  }

  if (env.WHATSAPP_MOCK_MODE) {
    const mockMessageId = `mocked-${Date.now()}`;
    logger.info("whatsapp.mock.send", {
      phoneNumber: normalizedPhoneNumber,
      payload,
    });
    return { messageId: mockMessageId, skipped: false as const };
  }

  const endpoint = `${env.WHATSAPP_BASE_URL}/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_ID}/messages`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text();
    logger.error("whatsapp.send.failed", {
      phoneNumber: normalizedPhoneNumber,
      details,
    });
    throw new Error(`WhatsApp API request failed: ${details}`);
  }

  logger.info("whatsapp.send.succeeded", {
    phoneNumber: normalizedPhoneNumber,
  });

  const data = (await response.json()) as {
    messages?: Array<{
      id?: string;
    }>;
  };

  return {
    messageId: data.messages?.[0]?.id ?? null,
    skipped: false as const,
  };
}

async function sendWhatsAppTextMessage(
  phoneNumber: string,
  body: string,
  options?: SendMessageOptions,
) {
  return sendWhatsAppMessage(
    phoneNumber,
    {
      messaging_product: "whatsapp",
      to: toWhatsAppRecipient(phoneNumber),
      type: "text",
      text: { body },
    },
    options,
  );
}

async function sendWhatsAppTemplateMessage(
  phoneNumber: string,
  template: WhatsAppTemplatePayload,
  options?: SendMessageOptions,
) {
  return sendWhatsAppMessage(
    phoneNumber,
    {
      messaging_product: "whatsapp",
      to: toWhatsAppRecipient(phoneNumber),
      type: "template",
      template,
    },
    options,
  );
}

export function getTrustLinkWhatsAppOptInLink() {
  if (!env.TRUSTLINK_BUSINESS_NUMBER) {
    throw new Error("TRUSTLINK_BUSINESS_NUMBER is not configured");
  }

  return `https://wa.me/${env.TRUSTLINK_BUSINESS_NUMBER}?text=${encodeURIComponent("START TRUSTLINK")}`;
}

export function isTrustLinkOptInMessage(message: string) {
  return message.trim().toUpperCase() === "START TRUSTLINK";
}

export function isTrustLinkStopMessage(message: string) {
  return message.trim().toUpperCase() === "STOP";
}

export async function sendIncomingTransferAlert(phoneNumber: string, referenceCode: string) {
  const message = `Incoming transfer\nReference: ${referenceCode}`;
  return sendWhatsAppTextMessage(phoneNumber, message, { category: "notification" });
}

export async function sendPaymentNotification(params: {
  phoneNumber: string;
  amount: number;
  token: string;
  paymentId: string;
  senderDisplayName: string;
  senderHandle: string;
  referenceCode: string;
}) {
  const claimUrl = `${env.TRUSTLINK_CLAIM_BASE_URL}/${params.paymentId}`;
  if (env.WHATSAPP_USE_TEMPLATES && env.WHATSAPP_PAYMENT_TEMPLATE_NAME) {
    return sendWhatsAppTemplateMessage(
      params.phoneNumber,
      {
        name: env.WHATSAPP_PAYMENT_TEMPLATE_NAME,
        language: {
          code: env.WHATSAPP_TEMPLATE_LANGUAGE_CODE,
        },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: params.senderDisplayName },
              { type: "text", text: `@${params.senderHandle}` },
              { type: "text", text: params.referenceCode },
              { type: "text", text: `${params.amount}` },
              { type: "text", text: params.token },
              { type: "text", text: claimUrl },
            ],
          },
        ],
      },
      { category: "notification" },
    );
  }

  const message = [
    "You received a crypto payment via TrustLink.",
    "",
    `From: ${params.senderDisplayName} (@${params.senderHandle})`,
    `Reference: ${params.referenceCode}`,
    "",
    `Amount: ${params.amount} ${params.token}`,
    "",
    `Claim payment: ${claimUrl}`,
  ].join("\n");

  return sendWhatsAppTextMessage(params.phoneNumber, message, { category: "notification" });
}

export async function sendOtp(phoneNumber: string, otp: string) {
  if (env.WHATSAPP_USE_TEMPLATES && env.WHATSAPP_OTP_TEMPLATE_NAME) {
    return sendWhatsAppTemplateMessage(
      phoneNumber,
      {
        name: env.WHATSAPP_OTP_TEMPLATE_NAME,
        language: {
          code: env.WHATSAPP_TEMPLATE_LANGUAGE_CODE,
        },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: otp }],
          },
        ],
      },
      { category: "auth" },
    );
  }

  const message = `Verification code: ${otp}. Expires in ${env.OTP_TTL_MINUTES} minutes.`;
  return sendWhatsAppTextMessage(phoneNumber, message, { category: "auth" });
}

export async function sendAuthOtp(phoneNumber: string, otp: string) {
  const message = [
    "TrustLink sign-in code",
    `Code: ${otp}`,
    `Expires in ${env.OTP_TTL_MINUTES} minutes.`,
  ].join("\n");

  return sendWhatsAppTextMessage(phoneNumber, message, {
    bypassOptInCheck: false,
    category: "auth",
  });
}

export async function sendWelcomeMessage(phoneNumber: string, displayName: string, handle: string) {
  const message = [
    `Welcome to TrustLink, ${displayName}.`,
    "",
    "Your account has been created successfully.",
    `Your TrustLink handle: @${handle}`,
    "",
    "You can now send and receive crypto payments with TrustLink.",
  ].join("\n");

  return sendWhatsAppTextMessage(phoneNumber, message, { category: "notification" });
}

export async function sendPaymentClaimedMessage(params: {
  phoneNumber: string;
  referenceCode: string;
  amount: number;
  token: string;
  walletAddress: string;
  senderDisplayName: string;
  senderHandle: string;
  transactionUrl: string | null;
}) {
  const message = [
    "Payment claimed successfully.",
    `From: ${params.senderDisplayName} (@${params.senderHandle})`,
    `Reference: ${params.referenceCode}`,
    `Amount: ${params.amount} ${params.token}`,
    `Claimed to wallet: ${params.walletAddress}`,
  ];

  if (params.transactionUrl) {
    message.push(`Transaction: ${params.transactionUrl}`);
  }

  return sendWhatsAppTextMessage(params.phoneNumber, message.join("\n"), { category: "notification" });
}
