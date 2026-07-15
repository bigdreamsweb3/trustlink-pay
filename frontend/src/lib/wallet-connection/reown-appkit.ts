"use client";

import { createAppKit, type AppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { solana, solanaDevnet } from "@reown/appkit/networks";

let appKitConfigured = false;
let trustLinkAppKit: AppKit | null = null;

const REOWN_PROJECT_ID_PATTERN = /^[0-9a-f]{32}$/i;

function getReownProjectId() {
  return process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";
}

export function hasReownProjectId() {
  return REOWN_PROJECT_ID_PATTERN.test(getReownProjectId());
}

function getConfiguredAppUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_TRUSTLINK_APP_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3001";
}

export function configureTrustLinkAppKit() {
  if (appKitConfigured) {
    return trustLinkAppKit;
  }

  const projectId = getReownProjectId();

  if (!hasReownProjectId()) {
    appKitConfigured = true;
    return null;
  }

  const appOrigin = getConfiguredAppUrl();

  trustLinkAppKit = createAppKit({
    adapters: [new SolanaAdapter()],
    networks: [solanaDevnet, solana],
    defaultNetwork: solanaDevnet,
    projectId,
    metadata: {
      name: "TrustLink Pay",
      description: "Non-custodial stablecoin payments on Solana.",
      url: appOrigin,
      icons: [`${appOrigin}/trustlink-logo.png`],
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
    },
  });

  appKitConfigured = true;
  return trustLinkAppKit;
}

export function openTrustLinkWalletModal() {
  const appKit = configureTrustLinkAppKit();

  if (!appKit) {
    throw new Error(
      "Reown is not configured. Set a valid 32-character NEXT_PUBLIC_REOWN_PROJECT_ID in frontend/.env.local, then restart the frontend.",
    );
  }

  appKit.open();
}
