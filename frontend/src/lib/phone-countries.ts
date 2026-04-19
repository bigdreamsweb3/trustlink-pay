export type CountryOption = {
  iso2: string;
  name: string;
  dialCode: string;
  flag: string;
  localPrefix?: string;
  localLength?: number;
};

export const COUNTRY_OPTIONS: CountryOption[] = [
  { iso2: "NG", name: "Nigeria", dialCode: "+234", flag: "🇳🇬", localPrefix: "0", localLength: 10 },
  { iso2: "GH", name: "Ghana", dialCode: "+233", flag: "🇬🇭", localPrefix: "0", localLength: 9 },
  { iso2: "KE", name: "Kenya", dialCode: "+254", flag: "🇰🇪", localPrefix: "0", localLength: 9 },
  { iso2: "ZA", name: "South Africa", dialCode: "+27", flag: "🇿🇦", localPrefix: "0", localLength: 9 },
  { iso2: "US", name: "United States", dialCode: "+1", flag: "🇺🇸", localLength: 10 },
  { iso2: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦", localLength: 10 },
  { iso2: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧", localPrefix: "0", localLength: 10 },
  { iso2: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪", localPrefix: "0", localLength: 9 },
  { iso2: "IN", name: "India", dialCode: "+91", flag: "🇮🇳", localLength: 10 },
];

export function getCountryByIso2(iso2: string | null | undefined) {
  if (!iso2) {
    return null;
  }

  return COUNTRY_OPTIONS.find((option) => option.iso2 === iso2.toUpperCase()) ?? null;
}

export function getCountryByDialCode(phoneNumber: string) {
  const normalized = phoneNumber.trim();
  const matches = COUNTRY_OPTIONS.filter((option) => normalized.startsWith(option.dialCode));

  return matches.sort((left, right) => right.dialCode.length - left.dialCode.length)[0] ?? null;
}

export function splitPhoneNumber(phoneNumber: string) {
  const match = getCountryByDialCode(phoneNumber);

  if (!match) {
    return {
      country: null,
      localNumber: phoneNumber.replace(/[^\d]/g, ""),
    };
  }

  return {
    country: match,
    localNumber: phoneNumber.slice(match.dialCode.length).replace(/[^\d]/g, ""),
  };
}

export function detectCountryFromLocale() {
  if (typeof window === "undefined") {
    return COUNTRY_OPTIONS[0];
  }

  const locales = [
    ...((window.navigator.languages ?? []) as string[]),
    window.navigator.language,
    Intl.DateTimeFormat().resolvedOptions().locale,
  ].filter(Boolean);

  for (const locale of locales) {
    const region = locale.split("-")[1]?.toUpperCase();
    const match = getCountryByIso2(region);

    if (match) {
      return match;
    }
  }

  return COUNTRY_OPTIONS[0];
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function formatGroupedDigits(digits: string, groupSizes: number[]) {
  const groups: string[] = [];
  let cursor = 0;

  for (const size of groupSizes) {
    if (cursor >= digits.length) {
      break;
    }

    groups.push(digits.slice(cursor, cursor + size));
    cursor += size;
  }

  while (cursor < digits.length) {
    groups.push(digits.slice(cursor, cursor + 4));
    cursor += 4;
  }

  return groups.filter(Boolean).join(" ");
}

export function formatPhoneInput(value: string) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = digitsOnly(trimmed);

  if (!digits) {
    return hasPlus ? "+" : "";
  }

  if (hasPlus) {
    return `+${formatGroupedDigits(digits, [3, 3, 4])}`;
  }

  return formatGroupedDigits(digits, [3, 3, 4]);
}

export function getCountryFromBareDialCode(value: string) {
  const digits = digitsOnly(value);

  if (!digits || value.trim().startsWith("+") || value.trim().startsWith("0")) {
    return null;
  }

  const country = getCountryByDialCode(`+${digits}`);

  if (!country) {
    return null;
  }

  const dialDigits = digitsOnly(country.dialCode);

  return digits.length > dialDigits.length ? country : null;
}

export function normalizePhoneInput(value: string, country?: CountryOption | null) {
  const trimmed = value.trim();
  const digits = digitsOnly(trimmed);

  if (!digits) {
    return null;
  }

  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }

  if (!country) {
    return null;
  }

  if (trimmed.startsWith("0")) {
    const localDigits = digits.slice(1);
    return localDigits ? `${country.dialCode}${localDigits}` : null;
  }

  return `${country.dialCode}${digits}`;
}

export function getHeuristicCountries(localDigits: string) {
  if (!/^\d{10}$/.test(localDigits)) {
    return [] as CountryOption[];
  }

  const heuristicMatches: CountryOption[] = [];

  // NANP-like 10-digit numbers.
  if (/^[2-9]\d{9}$/.test(localDigits)) {
    const us = getCountryByIso2("US");
    const ca = getCountryByIso2("CA");

    if (us) {
      heuristicMatches.push(us);
    }

    if (ca) {
      heuristicMatches.push(ca);
    }
  }

  // Nigeria commonly entered as 10 digits without the leading 0.
  if (/^[7-9]\d{9}$/.test(localDigits)) {
    const ng = getCountryByIso2("NG");

    if (ng) {
      heuristicMatches.push(ng);
    }
  }

  return heuristicMatches;
}

export function getCandidateCountries(params: {
  localDigits: string;
  preferredCountry?: CountryOption | null;
  localeCountry?: CountryOption | null;
  manualCountry?: CountryOption | null;
}) {
  const ordered = [
    params.manualCountry ?? null,
    params.preferredCountry ?? null,
    params.localeCountry ?? null,
    ...getHeuristicCountries(params.localDigits),
  ].filter(Boolean) as CountryOption[];

  const seen = new Set<string>();

  return ordered.filter((country) => {
    if (seen.has(country.iso2)) {
      return false;
    }

    seen.add(country.iso2);
    return true;
  });
}
