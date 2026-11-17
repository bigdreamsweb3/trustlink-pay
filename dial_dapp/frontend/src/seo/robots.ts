import { MetadataRoute } from "next";
import { BASE_URL, PRIVATE_ROUTES, PUBLIC_ROUTES } from "./routes";

/**
 * Automatically generates the robots.txt configuration based on
 * the centralized route registry.
 */
export function generateRobots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: PUBLIC_ROUTES.map((route) => route.path),
      disallow: PRIVATE_ROUTES,
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
