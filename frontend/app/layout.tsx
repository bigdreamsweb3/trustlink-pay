import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans, Sora } from "next/font/google";
import type { ReactNode } from "react";

import { AppProviders } from "@/app/providers";

import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap"
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display-face",
  display: "swap"
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-tactical-face",
  weight: ["400", "500", "600"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "TrustLink",
  description: "Crypto payments over WhatsApp with a product experience built for normal people."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${plusJakartaSans.variable} ${sora.variable} ${ibmPlexMono.variable}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
