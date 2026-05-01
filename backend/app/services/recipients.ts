import { findUserByPhoneNumber } from "@/app/db/users";
import { findLatestWhatsAppProfileNameByPhoneNumber } from "@/app/db/whatsapp-webhook-events";
import { logger } from "@/app/lib/logger";
import { verifyWhatsAppNumber } from "@/app/services/whatsapp-number-verification";

export type RecipientLookupResult =
  | {
      status: "invalid_whatsapp_number";
      verified: false;
      recipient: {
        displayName: string;
        handle: null;
        phoneNumber: string;
        source: "invalid";
        whatsappProfileName: null;
      };
      warning: string;
    }
  | {
      status: "registered";
      verified: true;
      recipient: {
        displayName: string;
        handle: string;
        phoneNumber: string;
        source: "trustlink";
        whatsappProfileName: string | null;
      };
    }
  | {
      status: "whatsapp_only";
      verified: true;
      recipient: {
        displayName: string;
        handle: null;
        phoneNumber: string;
        source: "whatsapp";
        whatsappProfileName: string;
      };
      warning: string;
    }
  | {
      status: "manual_invite_required";
      verified: true;
      recipient: {
        displayName: string;
        handle: null;
        phoneNumber: string;
        source: "manual_invite";
        whatsappProfileName: null;
      };
      warning: string;
    };

export async function lookupRecipientIdentity(
  phoneNumber: string,
  options?: { skipWhatsAppCheck?: boolean },
): Promise<RecipientLookupResult> {
  const whatsappDisplayName =
    await findLatestWhatsAppProfileNameByPhoneNumber(phoneNumber);
  const trustLinkUser = await findUserByPhoneNumber(phoneNumber);
  const resolvedDisplayName =
    trustLinkUser?.display_name?.trim() || whatsappDisplayName || phoneNumber;

  if (trustLinkUser?.phone_verified_at) {
    logger.info("recipient.lookup.checked", {
      phoneNumber,
      hasTrustLinkUser: true,
      trustLinkUserId: trustLinkUser.id,
      trustLinkDisplayName: trustLinkUser.display_name ?? null,
      trustLinkHandle: trustLinkUser.trustlink_handle ?? null,
      trustLinkPhoneVerifiedAt: trustLinkUser.phone_verified_at ?? null,
      trustLinkWhatsappOptedIn: trustLinkUser.whatsapp_opted_in ?? null,
      trustLinkPinHashPresent: Boolean(trustLinkUser.pin_hash),
      whatsappDisplayName,
      skippedWhatsAppCheck: Boolean(options?.skipWhatsAppCheck),
    });

    return {
      status: "registered",
      verified: true,
      recipient: {
        displayName: resolvedDisplayName,
        handle: trustLinkUser.trustlink_handle,
        phoneNumber: trustLinkUser.phone_number,
        source: "trustlink",
        whatsappProfileName: whatsappDisplayName,
      },
    };
  }

  const whatsappVerification = await verifyWhatsAppNumber(phoneNumber);
  if (!whatsappVerification.exists && !options?.skipWhatsAppCheck) {
    logger.info("recipient.lookup.invalid_whatsapp_number", {
      phoneNumber,
      isInvalid: whatsappVerification.isInvalid,
      source: whatsappVerification.source,
    });

    return {
      status: "invalid_whatsapp_number",
      verified: false,
      recipient: {
        displayName: phoneNumber,
        handle: null,
        phoneNumber,
        source: "invalid",
        whatsappProfileName: null,
      },
      warning: "",
    };
  }

  logger.info("recipient.lookup.checked", {
    phoneNumber,
    hasTrustLinkUser: Boolean(trustLinkUser),
    trustLinkUserId: trustLinkUser?.id ?? null,
    trustLinkDisplayName: trustLinkUser?.display_name ?? null,
    trustLinkHandle: trustLinkUser?.trustlink_handle ?? null,
    trustLinkPhoneVerifiedAt: trustLinkUser?.phone_verified_at ?? null,
    trustLinkWhatsappOptedIn: trustLinkUser?.whatsapp_opted_in ?? null,
    trustLinkPinHashPresent: trustLinkUser
      ? Boolean(trustLinkUser.pin_hash)
      : null,
    whatsappDisplayName,
  });

  if (trustLinkUser) {
    return {
      status: "whatsapp_only",
      verified: true,
      recipient: {
        displayName: resolvedDisplayName,
        handle: null,
        phoneNumber: trustLinkUser.phone_number,
        source: "whatsapp",
        whatsappProfileName: whatsappDisplayName ?? trustLinkUser.display_name,
      },
      warning: trustLinkUser.whatsapp_opted_in
        ? "This number has started TrustLink onboarding but has not completed account setup yet."
        : "This number exists in TrustLink records but is not available for automatic TrustLink WhatsApp delivery right now.",
    };
  }

  if (whatsappDisplayName) {
    return {
      status: "whatsapp_only",
      verified: true,
      recipient: {
        displayName: whatsappDisplayName,
        handle: null,
        phoneNumber,
        source: "whatsapp",
        whatsappProfileName: whatsappDisplayName,
      },
      warning:
        "This number has interacted on WhatsApp but is not yet registered on TrustLink.",
    };
  }

  return {
    status: "manual_invite_required",
    verified: true,
    recipient: {
      displayName: phoneNumber,
      handle: null,
      phoneNumber,
      source: "manual_invite",
      whatsappProfileName: null,
    },
    warning:
      "This number is not yet known to TrustLink. You can still send funds, but you will need to share the claim invite yourself.",
  };
}
