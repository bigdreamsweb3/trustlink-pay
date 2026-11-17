const BACKEND_PROXY_PREFIX = "/backend";
export const DEFAULT_BACKEND_URL = "https://trustlink-pay-backend.vercel.app";

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function liveBackendUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeBaseUrl(DEFAULT_BACKEND_URL)}${cleanPath}`;
}

export function buildBackendUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  return `${BACKEND_PROXY_PREFIX}${cleanPath}`;
}

/**
 * Prefer the local Next proxy during development. If its backend is stopped,
 * retry the same request against the deployed TrustLink backend. Only
 * transport failures fall back; HTTP responses are returned to the caller so
 * authentication and validation errors are never hidden.
 */
export async function fetchBackend(path: string, init?: RequestInit) {
  const localUrl = buildBackendUrl(path);
  try {
    const response = await fetch(localUrl, { ...init, credentials: "include" });
    if (response.status < 500) {
      return response;
    }
  } catch {
    // Fall through to the deployed backend when the local proxy is stopped.
  }
  return fetch(liveBackendUrl(path), { ...init, credentials: "include" });
}
