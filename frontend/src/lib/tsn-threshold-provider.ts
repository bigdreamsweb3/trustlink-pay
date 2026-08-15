"use client";

import { TsnDeviceEnvelopeTinMasterSeedProvider } from "@trustlink/tsn-sdk/tin-device-key-provider";

let providerPromise: Promise<TsnDeviceEnvelopeTinMasterSeedProvider> | null = null;
let sessionBinding: string | null = null;

async function createProvider() {
  // The local device-envelope provider is retained only as an explicit
  // migration/test compatibility mode. It cannot unlock an existing TIN from
  // a newly authorized device because its data key is wrapped to one device's
  // non-exportable X25519 key. Production must use a deployed multi-device
  // threshold key-release provider instead of silently creating more legacy
  // envelopes.
  if (process.env.NEXT_PUBLIC_ALLOW_LEGACY_TIN_DEVICE_ENVELOPE !== "true") {
    throw new Error(
      "TIN multi-device threshold provider is not configured; this TIN balance remains locked until the TSN key-release service is deployed",
    );
  }
  sessionBinding ??= `tsn-device-envelope:${crypto.randomUUID()}`;
  return new TsnDeviceEnvelopeTinMasterSeedProvider(
    `tsn-device-envelope:${sessionBinding}`,
  );
}

export function getBrowserTinMasterSeedProvider() {
  providerPromise ??= createProvider();
  return providerPromise;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    providerPromise = null;
    sessionBinding = null;
  });
}
