"use client";

import { createAppKit, type AppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { solana, solanaDevnet } from "@reown/appkit/networks";

let appKitConfigured = false;
let trustLinkAppKit: AppKit | null = null;

function getReownProjectId() {
  return process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";
}

export function hasReownProjectId() {
  return getReownProjectId().length > 0 && getReownProjectId() !== "replace_with_reown_project_id";
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

  if (!projectId || projectId === "replace_with_reown_project_id") {
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
    throw new Error("WalletConnect is not configured. Add NEXT_PUBLIC_REOWN_PROJECT_ID to frontend/.env.local.");
  }

  appKit.open();
}
