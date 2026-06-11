import type { Dispatch, SetStateAction } from "react";

import type { CountryOption } from "@/src/lib/phone-countries";
import type { RecipientLookupResult, WhatsAppNumberVerificationResult } from "@/src/lib/types";

export type SendFormState = { receiverPhone: string; amount: string; token: string };

export type PhoneVerificationState = "idle" | "checking" | "valid" | "warning" | "invalid";

export type PhoneVerificationDetails = {
  displayName: string | null;
  profilePic: string | null;
  exists: boolean;
  isBusiness: boolean;
  url: string;
  resolvedPhoneNumber?: string | null;
  detectedCountry?: CountryOption | null;
};

export type ResolvedRecipientLookup = {
  verification: WhatsAppNumberVerificationResult;
  recipient: RecipientLookupResult | null;
  normalizedPhone: string;
  country: CountryOption | null;
};

export function resetRecipientResolution(params: {
  setPhoneVerificationState: (value: PhoneVerificationState) => void;
  setPhoneVerificationLabel: (value: string | null) => void;
  setPhoneVerificationDetails: (value: PhoneVerificationDetails | null) => void;
  setReceiverWhatsAppVerified: (value: boolean) => void;
  setReceiverCheckSkipped: (value: boolean) => void;
  setRecipientPreview: (value: RecipientLookupResult | null) => void;
  setLookupError: (value: string | null) => void;
  setPreviewBusy: (value: boolean) => void;
  setShowCountryFallback: (value: boolean) => void;
  setSuggestedCountries: (value: CountryOption[]) => void;
  setReceiverCountry: (value: CountryOption | null) => void;
  setForm: Dispatch<SetStateAction<SendFormState>>;
}) {
  params.setPhoneVerificationState("idle");
  params.setPhoneVerificationLabel(null);
  params.setPhoneVerificationDetails(null);
  params.setReceiverWhatsAppVerified(false);
  params.setReceiverCheckSkipped(false);
  params.setRecipientPreview(null);
  params.setLookupError(null);
  params.setPreviewBusy(false);
  params.setShowCountryFallback(false);
  params.setSuggestedCountries([]);
  params.setReceiverCountry(null);
  params.setForm((current) => ({ ...current, receiverPhone: "" }));
}
