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

  // Check if we're in development by looking at the hostname or environment
  const isDevelopment = 
    process.env.NODE_ENV === "development" ||
    (typeof window !== "undefined" && window.location.hostname === "localhost") ||
    !process.env.NEXT_PUBLIC_BACKEND_URL; // Fallback: if no backend URL is set, assume development
  
  const finalUrl = isDevelopment ? `${BACKEND_PROXY_PREFIX}${path}` : `${BACKEND_URL}${path}`;
  
  console.log("[Backend] Final URL:", finalUrl, "(isDevelopment:", isDevelopment, ")");
  
  return finalUrl;
}
