import type { Metadata } from "next";
import { BASE_URL, getAbsoluteUrl } from "./routes";

export const defaultTitle = "TrustLink Pay | Identity-First Blockchain Payment Solution on Solana";
export const defaultDescription =
  "TrustLink Pay is an identity-first blockchain payment solution for stablecoin payments on Solana, powered by Transfer Identity, PRUs, and TSN settlement.";

export const defaultKeywords = [
  "TrustLink Pay",
  "crypto payments",
  "blockchain solution",
  "blockchain payment solution",
  "blockchain payment system",
  "blockchain payment protocol",
  "stablecoin payment solution",
  "identity-first blockchain solution",
  "blockchain identity",
  "blockchain settlement",
  "blockchain payments on Solana",
  "send crypto with phone number",
  "stablecoin payments",
  "Solana payments",
  "Web3 payments",
  "noncustodial payments",
  "identity-first crypto",
  "TSN",
  "Transfer Settlement Network",
  "TIN",
  "Transfer Identity Number",
  "Transfer Identity System",
];

interface ConstructMetadataProps {
  title?: string;
  description?: string;
  keywords?: string[];
  path?: string;
  image?: string;
  noIndex?: boolean;
}

/**
 * Constructs standard Next.js Metadata objects to ensure
 * consistency across all TrustLink Pay routes and proper
 * Google Entity Understanding.
 */
export function constructMetadata({
  title,
  description = defaultDescription,
  keywords = defaultKeywords,
  path = "/",
  image = "/og-image.png",
  noIndex = false,
}: ConstructMetadataProps = {}): Metadata {
  const url = getAbsoluteUrl(path);
  const imageUrl = image.startsWith("http") ? image : getAbsoluteUrl(image);

  return {
    metadataBase: new URL(BASE_URL),
    title: title ? `${title} | TrustLink Pay` : defaultTitle,
    description,
    keywords,
    verification: {
      google: "d9guXBkvhJnBZRs9WHTbbDtuYzDGOyUSanRaQ5lIRns", // Migrated from original layout
    },
    openGraph: {
      title: title ? `${title} | TrustLink Pay` : defaultTitle,
      description,
      url,
      siteName: "TrustLink Pay",
      type: "website",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title ? `${title} - TrustLink Pay` : "TrustLink Pay - Identity-first blockchain payment solution",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: title ? `${title} | TrustLink Pay` : defaultTitle,
      description,
      images: [imageUrl],
    },
    alternates: {
      canonical: url,
    },
    robots: {
      index: !noIndex,
      follow: !noIndex,
    },
  };
}
