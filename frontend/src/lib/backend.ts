const BACKEND_PROXY_PREFIX = "/backend";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

export function buildBackendUrl(path: string) {
  // Debug logging
  console.log("[Backend] Environment check:", {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
    hostname: typeof window !== "undefined" ? window.location.hostname : "server",
    path
  });

  // Always use middleware proxy in this Next.js app (both dev and prod)
  // The middleware will handle routing to the correct backend
  const finalUrl = `${BACKEND_PROXY_PREFIX}${path}`;
  
  console.log("[Backend] Final URL:", finalUrl, "(using middleware proxy)");
  
  return finalUrl;
}
