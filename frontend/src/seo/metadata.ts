import type { Metadata } from "next";
import { BASE_URL, getAbsoluteUrl } from "./routes";

export const defaultTitle = "TrustLink Pay | Private Identity-First Crypto Payments on Solana";
export const defaultDescription =
  "Send crypto payments using a phone number or 10-digit TIN instead of wallet addresses with private settlement through TSN.";

export const defaultKeywords = [
  "TrustLink Pay",
  "crypto payments",
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
          alt: title ? `${title} - TrustLink Pay` : "TrustLink Pay - Identity-First Crypto Payments",
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
