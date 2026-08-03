"use client";

import {
  LitChipotleTinMasterSeedProvider,
  type LitTinActionExecutor,
} from "@trustlink/tsn-sdk/lit-threshold-provider";
import type { LitTinActionConfiguration } from "@trustlink/tsn-sdk/lit-tin-action-configuration";

let providerPromise: Promise<LitChipotleTinMasterSeedProvider> | null = null;
let sessionBinding: string | null = null;

const executeAction: LitTinActionExecutor = async (request, configuration) => {
  const response = await fetch("/api/tsn/threshold-action", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request, actionCid: configuration.actionCid }),
  });
  const body = await response.json() as { result?: unknown; error?: string };
  if (!response.ok || !body.result) {
    throw new Error(body.error || `TIN threshold action failed (${response.status})`);
  }
  return body.result as Awaited<ReturnType<LitTinActionExecutor>>;
};

async function createProvider() {
  const response = await fetch("/api/tsn/threshold-action", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("TIN threshold action configuration is unavailable");
  const configuration = await response.json() as LitTinActionConfiguration;
  sessionBinding ??= `lit-chipotle:${crypto.randomUUID()}`;
  return new LitChipotleTinMasterSeedProvider(
    configuration,
    executeAction,
    sessionBinding,
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
