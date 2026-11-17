import {
  digitsOnly,
  getCandidateCountries,
  getCountryFromBareDialCode,
  getCountryByDialCode,
  normalizePhoneInput,
  type CountryOption,
} from "@/src/lib/phone-countries";

export type PhoneResolutionCandidate = {
  normalizedPhone: string;
  country: CountryOption | null;
  revealFallback: boolean;
};

export type PhoneResolutionPlan =
  | {
      kind: "idle";
    }
  | {
      kind: "single";
      candidate: PhoneResolutionCandidate;
      suggestedCountries: CountryOption[];
    }
  | {
      kind: "multiple";
      candidates: PhoneResolutionCandidate[];
      suggestedCountries: CountryOption[];
    }
  | {
      kind: "fallback";
      suggestedCountries: CountryOption[];
    };

export function buildPhoneResolutionPlan(params: {
  input: string;
  localeCountry: CountryOption;
  preferredCountry: CountryOption;
  selectedCountry?: CountryOption | null;
  selectedCountryLocked?: boolean;
  minimumInternationalDigits?: number;
}) : PhoneResolutionPlan {
  const trimmed = params.input.trim();
  const digits = digitsOnly(trimmed);
  const minimumInternationalDigits = params.minimumInternationalDigits ?? 8;

  if (!trimmed) {
    return { kind: "idle" };
  }

  if (trimmed.startsWith("+")) {
    if (digits.length < minimumInternationalDigits) {
      return { kind: "idle" };
    }

    const normalizedPhone = `+${digits}`;
    const country = getCountryByDialCode(normalizedPhone);

    return {
      kind: "single",
      candidate: {
        normalizedPhone,
        country,
        revealFallback: false,
      },
      suggestedCountries: country
        ? [country, params.preferredCountry, params.localeCountry].filter(
            (value, index, array) =>
              array.findIndex((item) => item.iso2 === value.iso2) === index,
          )
        : [params.preferredCountry, params.localeCountry],
    };
  }

  const bareDialCodeCountry = getCountryFromBareDialCode(trimmed);

  if (bareDialCodeCountry) {
    const dialDigits = digitsOnly(bareDialCodeCountry.dialCode).length;
    const minimumDigits = dialDigits + (bareDialCodeCountry.localLength ?? 10);

    if (digits.length < minimumDigits) {
      return { kind: "idle" };
    }

    return {
      kind: "single",
      candidate: {
        normalizedPhone: `+${digits}`,
        country: bareDialCodeCountry,
        revealFallback: false,
      },
      suggestedCountries: [bareDialCodeCountry],
    };
  }

  if (trimmed.startsWith("0")) {
    const country =
      (params.selectedCountryLocked ? params.selectedCountry : null) ??
      params.selectedCountry ??
      params.preferredCountry ??
      params.localeCountry;
    const minimumLocalDigits =
      (country?.localLength ?? 10) + (country?.localPrefix ? 1 : 0);

    if (!country || digits.length < minimumLocalDigits) {
      return { kind: "idle" };
    }

    const normalizedPhone = normalizePhoneInput(trimmed, country);

    if (!normalizedPhone) {
      return {
        kind: "fallback",
        suggestedCountries: [country],
      };
    }

    return {
      kind: "single",
      candidate: {
        normalizedPhone,
        country,
        revealFallback: !params.selectedCountry,
      },
      suggestedCountries: [country],
    };
  }

  if (digits.length < 10) {
    return { kind: "idle" };
  }

  const candidateCountries =
    params.selectedCountryLocked && params.selectedCountry
      ? [params.selectedCountry]
      : params.selectedCountry
        ? [params.selectedCountry]
        : getCandidateCountries({
            localDigits: digits.slice(0, 10),
            manualCountry: null,
            preferredCountry: params.preferredCountry,
            localeCountry: params.localeCountry,
          });

  const candidates = candidateCountries
    .map((country) => {
      const normalizedPhone = normalizePhoneInput(digits.slice(0, 10), country);

      if (!normalizedPhone) {
        return null;
      }

      return {
        normalizedPhone,
        country,
        revealFallback: false,
      } satisfies PhoneResolutionCandidate;
    })
    .filter(Boolean) as PhoneResolutionCandidate[];

  if (candidates.length === 0) {
    return {
      kind: "fallback",
      suggestedCountries: candidateCountries,
    };
  }

  return params.selectedCountryLocked || params.selectedCountry
    ? {
        kind: "single",
        candidate: candidates[0],
        suggestedCountries: candidateCountries,
      }
    : {
        kind: "multiple",
        candidates,
        suggestedCountries: candidateCountries,
      };
}
