import { randomBytes } from "node:crypto";

import { getWhatsAppSdkConfig } from "../config";

export const TRUSTLINK_SESSION_CODE_PREFIX = "TLS";
export const TRUSTLINK_SESSION_CODE_LEGACY_PREFIX = "TL";
export const TRUSTLINK_SESSION_CODE_BODY_LENGTH = 6;

export function getTrustLinkSessionExpiryMinutes() {
  return getWhatsAppSdkConfig().AUTH_SESSION_CODE_TTL_MINUTES;
}

export function generateTrustLinkSessionCode(): string {
  const randomPart = randomBytes(3)
    .toString("hex")
    .toUpperCase()
    .slice(0, TRUSTLINK_SESSION_CODE_BODY_LENGTH);
  return `${TRUSTLINK_SESSION_CODE_PREFIX}${randomPart}`;
}

export function isTrustLinkSessionCode(value: string) {
  return Boolean(
    value.match(
      new RegExp(
        `^(${TRUSTLINK_SESSION_CODE_PREFIX}|${TRUSTLINK_SESSION_CODE_LEGACY_PREFIX})[A-Z0-9]{${TRUSTLINK_SESSION_CODE_BODY_LENGTH}}$`,
        "i",
      ),
    ),
  );
}

