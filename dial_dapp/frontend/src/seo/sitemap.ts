import { MetadataRoute } from "next";
import { PUBLIC_ROUTES, getAbsoluteUrl } from "./routes";

/**
 * Automatically generates the sitemap from the centralized route registry.
 * Excludes any private routes by definition.
 */
export function generateSitemap(): MetadataRoute.Sitemap {
  // Using a static date for now, but in a real CMS this could be dynamic per page
  const lastModified = new Date();

  return PUBLIC_ROUTES.map((route) => ({
    url: getAbsoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
