const COUNTRY_USAGE_KEY = "trustlink.countryUsage";

export function loadPreferredCountryIso2() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(COUNTRY_USAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const usage = JSON.parse(raw) as Record<string, number>;
    const top = Object.entries(usage).sort((left, right) => right[1] - left[1])[0];
    return top?.[0] ?? null;
  } catch {
    return null;
  }
}

export function rememberCountryUsage(iso2: string) {
  if (typeof window === "undefined") {
    return;
  }

  const raw = window.localStorage.getItem(COUNTRY_USAGE_KEY);
  let usage: Record<string, number> = {};

  try {
    usage = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    usage = {};
  }

  usage[iso2] = (usage[iso2] ?? 0) + 1;
  window.localStorage.setItem(COUNTRY_USAGE_KEY, JSON.stringify(usage));
}
