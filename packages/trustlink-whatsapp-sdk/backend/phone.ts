export function normalizePhoneNumber(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Phone number is required");
  }

  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) {
    throw new Error("Phone number must contain digits");
  }

  return trimmed.startsWith("+") ? `+${digits}` : `+${digits}`;
}

export function toWhatsAppRecipient(phoneNumber: string) {
  return normalizePhoneNumber(phoneNumber).replace(/^\+/, "");
}
