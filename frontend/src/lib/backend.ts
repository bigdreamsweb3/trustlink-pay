const BACKEND_PROXY_PREFIX = "/backend";
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";
const USE_DIRECT_BACKEND =
  process.env.NEXT_PUBLIC_USE_DIRECT_BACKEND === "true";

export function buildBackendUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  // Secure default: always use local Next.js proxy path to avoid browser CORS issues.
  // Set NEXT_PUBLIC_USE_DIRECT_BACKEND=true only when backend CORS is explicitly configured.
  if (USE_DIRECT_BACKEND && process.env.NEXT_PUBLIC_BACKEND_URL) {
    return `${BACKEND_URL}${cleanPath}`;
  }

  return `${BACKEND_PROXY_PREFIX}${cleanPath}`;
}
