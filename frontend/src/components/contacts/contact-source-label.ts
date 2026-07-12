"use client";

import type { TrustLinkContactSource } from "@/src/lib/contacts/types";

const CONTACT_SOURCE_LABELS: Record<TrustLinkContactSource, string> = {
  manual: "Saved manually",
  payment: "Paid before",
  device_import: "Device import",
  tin_lookup: "TIN lookup",
};

export function contactSourceLabel(source: TrustLinkContactSource) {
  return CONTACT_SOURCE_LABELS[source] ?? "Saved contact";
}
