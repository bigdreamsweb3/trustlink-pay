import { apiPost } from "@/src/lib/api";
import { formatPhoneInput, type CountryOption } from "@/src/lib/phone-countries";
import type { RecipientLookupResult, WhatsAppNumberVerificationResult } from "@/src/lib/types";
import type { ResolvedRecipientLookup } from "@/src/components/experiences/send/lib/recipient-resolution";

type LookupCache = Map<string, ResolvedRecipientLookup>;

export async function lookupResolvedRecipient(params: {
  cache: LookupCache;
  normalizedPhone: string;
  country: CountryOption | null;
  allowUnverified?: boolean;
}) {
  const key = `${params.normalizedPhone}:${params.allowUnverified ? "manual" : "auto"}`;
  const cached = params.cache.get(key);
  if (cached) return cached;

  const [verification, recipient] = await Promise.all([
    apiPost<WhatsAppNumberVerificationResult>("/api/whatsapp/verify-number", { phoneNumber: params.normalizedPhone }, undefined, { cache: "default", ttlMs: 5 * 60_000 }),
    apiPost<RecipientLookupResult>("/api/recipient/lookup", { phoneNumber: params.normalizedPhone, skipWhatsAppCheck: params.allowUnverified }, undefined, { cache: "default", ttlMs: 60_000 }),
  ]);
  const resolved = { verification, recipient, normalizedPhone: params.normalizedPhone, country: params.country } satisfies ResolvedRecipientLookup;
  params.cache.set(key, resolved);
  return resolved;
}

export async function lookupResolvedTin(params: {
  cache: LookupCache;
  tin: string;
}) {
  const key = `tin:${params.tin}`;
  const cached = params.cache.get(key);
  if (cached) return cached;

  const recipient = await apiPost<RecipientLookupResult>("/api/recipient/lookup", { tin: params.tin }, undefined, { cache: "default", ttlMs: 60_000 });
  const normalizedPhone = recipient?.recipient.phoneNumber ?? "";
  const verification: WhatsAppNumberVerificationResult = {
    phoneNumber: normalizedPhone,
    exists: Boolean(recipient?.verified),
    accountType: "personal_or_none",
    isBusiness: false,
    isInvalid: !recipient?.verified,
    displayName: recipient?.recipient.displayName ?? `TIN ${params.tin}`,
    profilePic: null,
    hasProfilePic: false,
    url: normalizedPhone ? `https://wa.me/${normalizedPhone.replace(/\D/g, "")}` : "",
    source: "mock",
  };
  const resolved = { verification, recipient, normalizedPhone, country: null } satisfies ResolvedRecipientLookup;
  params.cache.set(key, resolved);
  return resolved;
}

export function buildPhoneVerificationDetails(resolved: ResolvedRecipientLookup) {
  return {
    displayName: resolved.verification.displayName,
    profilePic: resolved.verification.profilePic,
    exists: resolved.verification.exists,
    isBusiness: resolved.verification.isBusiness,
    url: resolved.verification.url,
    resolvedPhoneNumber: formatPhoneInput(resolved.normalizedPhone),
    detectedCountry: resolved.country,
  };
}
