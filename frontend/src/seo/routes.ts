export const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Default to localhost, frontend runs on port 3001 in this project
  return "http://localhost:3001";
};

export const BASE_URL = getBaseUrl();

export { PUBLIC_ROUTES } from "./generated-public-routes";
export type { ChangeFrequency, PublicRoute } from "./route-types";

// Private routes that should be explicitly disallowed in robots.txt
export const PRIVATE_ROUTES: string[] = [
  "/app",
  "/auth",
  "/claim",
  "/operator-dashboard",
  "/dashboard",
  "/settings",
  "/admin",
  "/internal",
  "/private",
  "/api/private",
  "/api",
  "/backend",
];

/**
 * Returns the absolute URL for a given path
 */
export function getAbsoluteUrl(path: string): string {
  // Prevent double slashes when joining base and path
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_URL}${normalizedPath === "/" ? "" : normalizedPath}`;
}
