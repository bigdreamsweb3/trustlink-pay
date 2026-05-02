import { env } from "@/app/lib/env";

function normalizeOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function resolveAppBaseUrl(preferredOrigin?: string | null) {
  return (
    normalizeOrigin(preferredOrigin) ??
    normalizeOrigin(env.APP_BASE_URL) ??
    "http://localhost:3000"
  );
}

export function resolveAppBaseUrlFromRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (host) {
    const proto = forwardedProto ?? (host.includes("localhost") ? "http" : "https");
    const resolved = normalizeOrigin(`${proto}://${host}`);
    if (resolved) {
      return resolved;
    }
  }

  return normalizeOrigin(request.url);
}
