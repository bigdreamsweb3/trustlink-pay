"use client";

import { TsnDeviceEnvelopeTinMasterSeedProvider } from "@trustlink/tsn-sdk/tin-device-key-provider";

let providerPromise: Promise<TsnDeviceEnvelopeTinMasterSeedProvider> | null = null;
let sessionBinding: string | null = null;

async function createProvider() {
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
