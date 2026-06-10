import type { Dispatch, SetStateAction } from "react";
import type { RecipientLookupResult } from "@/src/lib/types";
import type { CountryOption } from "@/src/lib/phone-countries";
import type { PhoneVerificationDetails, RecipientVerificationState, SendFormState } from "@/src/components/experiences/send/types";

export function resetRecipientResolution(params: {
  setPhoneVerificationState: (value: RecipientVerificationState) => void;
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
