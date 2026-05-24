import {
  TRUSTLINK_SESSION_CODE_BODY_LENGTH,
  TRUSTLINK_SESSION_CODE_LEGACY_PREFIX,
  TRUSTLINK_SESSION_CODE_PREFIX,
} from "./session-code";

export function buildTrustLinkSessionCodeMessage(sessionCode: string) {
  return `Verify TrustLink Pay Code: ${sessionCode}`;
}

export function getTrustLinkSessionCodeRegexSource() {
  return `(?:${TRUSTLINK_SESSION_CODE_PREFIX}|${TRUSTLINK_SESSION_CODE_LEGACY_PREFIX})[A-Z0-9]{${TRUSTLINK_SESSION_CODE_BODY_LENGTH}}`;
}

export function extractTrustLinkSessionCodeFromText(text: string): string | null {
  const codeSource = getTrustLinkSessionCodeRegexSource();
  const full = text.match(
    new RegExp(`Verify\\s+TrustLink Pay\\s+Code:\\s+(${codeSource})`, "i"),
  );
  if (full?.[1]) return full[1].toUpperCase();
  const codeOnly = text.match(new RegExp(`^(${codeSource})$`, "i"));
  if (codeOnly?.[1]) return codeOnly[1].toUpperCase();
  return null;
}

