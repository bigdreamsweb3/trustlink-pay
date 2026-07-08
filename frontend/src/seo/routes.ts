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

export type ChangeFreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface PublicRoute {
  path: string;
  priority: number;
  changeFrequency: ChangeFreq;
}

// All public routes that should be indexed by Google and appear in the sitemap.
export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: "/", priority: 1.0, changeFrequency: "daily" },
  { path: "/terms", priority: 0.5, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.5, changeFrequency: "monthly" },
  // { path: "/support", priority: 0.6, changeFrequency: "monthly" },
  // { path: "/claim", priority: 0.7, changeFrequency: "weekly" },

  // Future pages according to SEO architecture plan
  // { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  // { path: "/developer", priority: 0.8, changeFrequency: "weekly" },
  // { path: "/developer/sdk", priority: 0.8, changeFrequency: "weekly" },
  // { path: "/api", priority: 0.7, changeFrequency: "weekly" },
  // { path: "/whitepaper", priority: 0.9, changeFrequency: "monthly" },
  // { path: "/security", priority: 0.9, changeFrequency: "monthly" },
  { path: "/auth", priority: 0.6, changeFrequency: "monthly" },
  // { path: "/create-account", priority: 0.6, changeFrequency: "monthly" },

  // Documentation pages
  // { path: "/docs", priority: 0.9, changeFrequency: "weekly" },
  // { path: "/docs/tin-system", priority: 0.8, changeFrequency: "monthly" },
  // { path: "/docs/tsn", priority: 0.8, changeFrequency: "monthly" },
  // { path: "/docs/security", priority: 0.8, changeFrequency: "monthly" },
  // { path: "/docs/transfer-settlement-network", priority: 0.8, changeFrequency: "monthly" },
  // { path: "/docs/privacy-architecture", priority: 0.8, changeFrequency: "monthly" },
  // { path: "/docs/security-model", priority: 0.8, changeFrequency: "monthly" },
  // { path: "/docs/developer-sdk", priority: 0.8, changeFrequency: "monthly" },
];

// Private routes that should be explicitly disallowed in robots.txt
export const PRIVATE_ROUTES: string[] = [
  "/operator-dashboard",
  "/dashboard",
  "/settings",
  "/admin",
  "/internal",
  "/private",
  "/api/private",
  // "/auth"
];

/**
 * Returns the absolute URL for a given path
 */
export function getAbsoluteUrl(path: string): string {
  // Prevent double slashes when joining base and path
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_URL}${normalizedPath === "/" ? "" : normalizedPath}`;
}
