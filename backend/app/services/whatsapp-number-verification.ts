import { logger } from "@/app/lib/logger";
import { normalizePhoneNumber } from "@/app/utils/phone";

export type WhatsAppNumberVerificationResult = {
  phoneNumber: string;
  exists: boolean;
  accountType: "business" | "personal_or_none";
  displayName: string | null;
  profilePic: string | null;
  hasProfilePic: boolean;
  isBusiness: boolean;
  isInvalid: boolean;
  url: string;
  source: "trustlink_scraper" | "mock";
};

function getMetaContent(html: string, property: string) {
  const pattern = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  return pattern.exec(html)?.[1]?.trim() ?? "";
}

function getPageTitle(html: string) {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return match?.[1]?.trim() ?? "";
}

function decodeHtmlEntity(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanDisplayName(value: string, cleanNumber: string) {
  const normalized = decodeHtmlEntity(value)
    .replace(/Chat on WhatsApp with/gi, "")
    .replace(/Share on WhatsApp/gi, "")
    .trim();

  if (!normalized) {
    return null;
  }

  if (normalized.replace(/\D/g, "") === cleanNumber) {
    return null;
  }

  return normalized;
}

export async function verifyWhatsAppNumber(phoneNumber: string): Promise<WhatsAppNumberVerificationResult> {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const cleanNumber = normalizedPhoneNumber.replace(/[^\d]/g, "");
  const url = `https://api.whatsapp.com/send?phone=${cleanNumber}`;

  if (process.env.WHATSAPP_MOCK_MODE?.trim().toLowerCase() === "true") {
    const result = {
      phoneNumber: normalizedPhoneNumber,
      exists: true,
      accountType: "business" as const,
      displayName: "Mock Business",
      profilePic: null,
      hasProfilePic: false,
      isBusiness: true,
      isInvalid: false,
      url,
      source: "mock" as const,
    };

    logger.info("whatsapp.verify_number.mock", result);
    return result;
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    const details = await response.text();
    logger.error("whatsapp.verify_number.failed", {
      phoneNumber: normalizedPhoneNumber,
      details,
    });
    throw new Error(`WhatsApp profile verification failed: ${details}`);
  }

  const html = await response.text();
  const ogTitle = getMetaContent(html, "og:title");
  const ogDescription = getMetaContent(html, "og:description");
  const ogImage = getMetaContent(html, "og:image");
  const pageTitle = getPageTitle(html);
  const lowerHtml = html.toLowerCase();
  const lowerDescription = ogDescription.toLowerCase();

  const isBusiness =
    lowerDescription.includes("business account") || lowerHtml.includes("business account");

  const isInvalid =
    lowerHtml.includes("phone number shared via url is invalid") ||
    lowerHtml.includes("invalid number") ||
    lowerHtml.includes("the phone number is not on whatsapp");

  const isGenericLogo =
    Boolean(ogImage) &&
    (
      ogImage.includes("whatsapp-logo") ||
      ogImage.includes("default_profile") ||
      ogImage.includes("static.whatsapp.net") ||
      ogImage.includes("rsrc.php") ||
      ogImage.includes("logo")
    );

  const profilePic = ogImage ? decodeHtmlEntity(ogImage) : null;
  const hasProfilePic = Boolean(profilePic && !isGenericLogo);
  const displayName =
    cleanDisplayName(ogTitle, cleanNumber) ?? cleanDisplayName(pageTitle, cleanNumber);

  let exists = false;
  let accountType: "business" | "personal_or_none" = "personal_or_none";

  if (!isInvalid) {
    if (isBusiness) {
      exists = true;
      accountType = "business";
    } else if (hasProfilePic || displayName) {
      exists = true;
      accountType = "personal_or_none";
    }
  }

  const result = {
    phoneNumber: normalizedPhoneNumber,
    exists,
    accountType,
    displayName,
    profilePic,
    hasProfilePic,
    isBusiness,
    isInvalid,
    url,
    source: "trustlink_scraper" as const,
  };

  logger.info("whatsapp.verify_number.completed", {
    phoneNumber: normalizedPhoneNumber,
    exists: result.exists,
    accountType: result.accountType,
    displayName: result.displayName,
    hasProfilePic: result.hasProfilePic,
    isBusiness: result.isBusiness,
    isInvalid: result.isInvalid,
  });

  return result;
}
