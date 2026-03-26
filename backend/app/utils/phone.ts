export function normalizePhoneNumber(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Phone number is required");
  }

  const normalizedBase = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const normalized = normalizedBase.replace(/[^\d+]/g, "");
  const e164 = normalized.startsWith("+") ? normalized : `+${normalized}`;

  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    throw new Error("Phone number must be E.164 format");
  }

  return e164;
}

export function toWhatsAppRecipient(phoneNumber: string) {
  return normalizePhoneNumber(phoneNumber).replace(/^\+/, "");
}
