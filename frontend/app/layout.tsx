import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "@/app/providers";
import "./globals.css";
import "./tsn.css"
import { JetBrains_Mono } from 'next/font/google';
import { GlobalGridBackground } from "@/src/components/layout/global-grid-bg";

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-mono',
});


import { constructMetadata } from "@/src/seo/metadata";
import { generateSchemaScript, getOrganizationSchema, getWebSiteSchema } from "@/src/seo/schema";

/* ---------------- METADATA ---------------- */

export const metadata: Metadata = constructMetadata();

/* ---------------- LAYOUT ---------------- */

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const orgSchema = getOrganizationSchema();
  const webSiteSchema = getWebSiteSchema();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* 🔥 STRUCTURED DATA (CRITICAL FOR GOOGLE RANKING) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={generateSchemaScript(orgSchema)}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={generateSchemaScript(webSiteSchema)}
        />
      </head>

      <body className={`${jetbrainsMono.variable} font-mono antialiased`} suppressHydrationWarning>
        <GlobalGridBackground />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
