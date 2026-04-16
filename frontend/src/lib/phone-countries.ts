export type CountryOption = {
  iso2: string;
  name: string;
  dialCode: string;
  flag: string;
};

export const COUNTRY_OPTIONS: CountryOption[] = [
  { iso2: "NG", name: "Nigeria", dialCode: "+234", flag: "🇳🇬" },
  // { iso2: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  // { iso2: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
  // { iso2: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  // { iso2: "GH", name: "Ghana", dialCode: "+233", flag: "🇬🇭" },
  // { iso2: "KE", name: "Kenya", dialCode: "+254", flag: "🇰🇪" },
  // { iso2: "ZA", name: "South Africa", dialCode: "+27", flag: "🇿🇦" },
  // { iso2: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪" },
  // { iso2: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" },
  // { iso2: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
  // { iso2: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱" },
  // { iso2: "IT", name: "Italy", dialCode: "+39", flag: "🇮🇹" },
  // { iso2: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸" },
  // { iso2: "PT", name: "Portugal", dialCode: "+351", flag: "🇵🇹" },
  // { iso2: "BR", name: "Brazil", dialCode: "+55", flag: "🇧🇷" },
  // { iso2: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽" },
  // { iso2: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
  // { iso2: "PK", name: "Pakistan", dialCode: "+92", flag: "🇵🇰" },
  // { iso2: "BD", name: "Bangladesh", dialCode: "+880", flag: "🇧🇩" },
  // { iso2: "ID", name: "Indonesia", dialCode: "+62", flag: "🇮🇩" },
  // { iso2: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬" },
  // { iso2: "MY", name: "Malaysia", dialCode: "+60", flag: "🇲🇾" },
  // { iso2: "TH", name: "Thailand", dialCode: "+66", flag: "🇹🇭" },
  // { iso2: "PH", name: "Philippines", dialCode: "+63", flag: "🇵🇭" },
  // { iso2: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" },
  // { iso2: "NZ", name: "New Zealand", dialCode: "+64", flag: "🇳🇿" }
];

export function getCountryByIso2(iso2: string | null | undefined) {
  if (!iso2) {
    return null;
  }

  return (
    COUNTRY_OPTIONS.find((option) => option.iso2 === iso2.toUpperCase()) ?? null
  );
}

export function getCountryByDialCode(phoneNumber: string) {
  const normalized = phoneNumber.trim();
  const matches = COUNTRY_OPTIONS.filter((option) =>
    normalized.startsWith(option.dialCode),
  );

  return (
    matches.sort(
      (left, right) => right.dialCode.length - left.dialCode.length,
    )[0] ?? null
  );
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
