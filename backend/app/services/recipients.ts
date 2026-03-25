import { findUserByPhoneNumber } from "@/app/db/users";
import { findLatestWhatsAppProfileNameByPhoneNumber } from "@/app/db/whatsapp-webhook-events";

export type RecipientLookupResult =
  | {
      status: "registered";
      verified: true;
      recipient: {
        displayName: string;
        handle: string;
        phoneNumber: string;
        source: "trustlink";
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
      };
      warning: string;
    }
  | {
      status: "unverified";
      verified: false;
      message: string;
    };

export async function lookupRecipientIdentity(phoneNumber: string): Promise<RecipientLookupResult> {
  const trustLinkUser = await findUserByPhoneNumber(phoneNumber);

  if (trustLinkUser) {
    return {
      status: "registered",
      verified: true,
      recipient: {
        displayName: trustLinkUser.display_name,
        handle: trustLinkUser.trustlink_handle,
        phoneNumber: trustLinkUser.phone_number,
        source: "trustlink"
      }
    };
  }

  const whatsappDisplayName = await findLatestWhatsAppProfileNameByPhoneNumber(phoneNumber);

  if (whatsappDisplayName) {
    return {
      status: "whatsapp_only",
      verified: true,
      recipient: {
        displayName: whatsappDisplayName,
        handle: null,
        phoneNumber,
        source: "whatsapp"
      },
      warning: "This number has interacted on WhatsApp but is not yet registered on TrustLink."
    };
  }

  return {
    status: "unverified",
    verified: false,
    message: "Recipient not found. Please verify the number."
  };
}
