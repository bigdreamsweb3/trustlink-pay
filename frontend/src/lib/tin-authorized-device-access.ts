"use client";

import { TsnDeviceEnvelopeTinMasterSeedProvider } from "@trustlink/tsn-sdk/tin-device-key-provider";
import {
  getTinBalanceSessionBinding,
  TIN_BALANCE_SESSION_CLEARED_EVENT,
} from "@/src/lib/tin-balance-session";

let providerPromise: Promise<TsnDeviceEnvelopeTinMasterSeedProvider> | null = null;
let sessionBinding: string | null = null;

async function createProvider() {
  // Private View already owns the authorized-device lifecycle. The SDK only
  // needs a tab-scoped local adapter that wraps the random TIN data key to
  // that device's non-exportable X25519 key. No separate TSN server decrypts
  // or releases the seed, and no plaintext seed leaves this browser.
  sessionBinding ??= getTinBalanceSessionBinding();
  return new TsnDeviceEnvelopeTinMasterSeedProvider(
    `tsn-device-envelope:${sessionBinding}`,
  );
}

export function getBrowserTinAuthorizedDeviceAccess() {
  providerPromise ??= createProvider();
  return providerPromise;
}

if (typeof window !== "undefined") {
  window.addEventListener(TIN_BALANCE_SESSION_CLEARED_EVENT, () => {
    providerPromise = null;
    sessionBinding = null;
  });
}

export function clearBrowserTinAuthorizedDeviceAccess() {
  providerPromise = null;
  sessionBinding = null;
}
