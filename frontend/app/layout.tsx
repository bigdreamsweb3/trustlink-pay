import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans, Sora } from "next/font/google";
import type { ReactNode } from "react";

import { AppProviders } from "@/app/providers";
import "./globals.css";

/* ---------------- Fonts ---------------- */

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display-face",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-tactical-face",
  weight: ["400", "500", "600"],
  display: "swap",
});

/* ---------------- SEO CONFIG ---------------- */

const baseUrl = "https://trustlink-pay.vercel.app/";

const title =
  "TrustLink Pay — Send Crypto to a Phone Number";

const description =
  "TrustLink Pay is a noncustodial crypto payment protocol on Solana that lets you send stablecoins using a phone number. Secure, gasless, and protected from address poisoning.";

/* ---------------- METADATA ---------------- */

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),

  title,
  description,

  keywords: [
    "crypto payments",
    "send crypto with phone number",
    "stablecoin payments",
    "Solana payments",
    "Web3 payments",
    "noncustodial payments",
    "gasless crypto",
    "blockchain payments",
  ],

  verification: {
    google: "d9guXBkvhJnBZRs9WHTbbDtuYzDGOyUSanRaQ5lIRns",
  },

  openGraph: {
    title,
    description,
    url: baseUrl,
    siteName: "TrustLink Pay",
    type: "website",
    images: [
      {
        url: `${baseUrl}/og-image.png`, 
        width: 1200,
        height: 630,
        alt: "TrustLink Pay - Send Crypto with confidence",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [`${baseUrl}/og-image.png`],
  },

  robots: {
    index: true,
    follow: true,
  },

  alternates: {
    canonical: baseUrl,
  },
};

/* ---------------- LAYOUT ---------------- */

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* 🔥 STRUCTURED DATA (CRITICAL FOR GOOGLE RANKING) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FinancialProduct",
              name: "TrustLink Pay",
              description:
                "Noncustodial crypto payment protocol that enables sending stablecoins using phone numbers (as identity proxy) on Solana.",
              brand: {
                "@type": "Brand",
                name: "TrustLink Pay",
              },
              category: "Cryptocurrency Payments",
              url: baseUrl,
              sameAs: [
                "https://twitter.com/0xbigdream",
                "https://github.com/bigdreamsweb3/trustlink-pay",
              ],
            }),
          }}
        />
      </head>

      <body
        className={`${plusJakartaSans.variable} ${sora.variable} ${ibmPlexMono.variable}`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
  }
