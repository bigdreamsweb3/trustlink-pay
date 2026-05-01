const BACKEND_PROXY_PREFIX = "/backend";
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

export function buildBackendUrl(path: string) {
  // Always use middleware proxy in this Next.js app (both dev and prod)
  // The middleware will handle routing to the correct backend
  const finalUrl = `${BACKEND_PROXY_PREFIX}${path}`;

  return finalUrl;
}
