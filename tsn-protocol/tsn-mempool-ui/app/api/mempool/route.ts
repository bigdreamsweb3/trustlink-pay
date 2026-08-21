import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

const BASES = [
  process.env.TSN_RECEIVER_URL || process.env.MEMPOOL_API_URL,
  process.env.TSN_RECEIVER_FALLBACK_URL || "https://tsn-receiver-kappa.vercel.app",
].filter(Boolean).map((value) => value!.replace(/\/$/, ""));

function opaqueId(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  return createHash("sha256").update(`tsn-public:${value}`).digest("hex").slice(0, 16);
}

async function get(path: string) {
  for (const base of Array.from(new Set(BASES))) {
    try {
      const response = await fetch(`${base}${path}`, { next: { revalidate: 3 } });
      if (response.ok) return response.json();
      if (response.status < 500) return null;
    } catch {
      // Try the deployed Receiver when the local service is stopped.
    }
  }
  return null;
}

function publicWork(item: any) {
  return {
    id: opaqueId(item?.id),
    kind: item?.kind ?? "UNKNOWN",
    status: item?.status ?? "UNKNOWN",
    stateVersion: item?.stateVersion ?? 0,
    payloadCommitment: item?.payloadCommitment ?? null,
    receivedAt: item?.receivedAt ?? null,
    updatedAt: item?.updatedAt ?? null,
    verification: item?.verification ?? null,
    result: item?.result
      ? {
          signature: opaqueId(item.result.signature),
          stage: item.result.stage ?? null,
          reason: item.result.reason ?? null,
        }
      : null,
  };
}

export async function GET() {
  const [receiverWork, network] = await Promise.all([
    get("/api/work"),
    get("/network/overview"),
  ]);
  const work = Array.isArray(receiverWork) ? receiverWork.map(publicWork) : [];
  const intents = work.filter((item) => item.kind === "AUTHORIZED_FUNDING");
  const tinOperations = work.filter((item) => item.kind === "TIN_OPERATION");
  return NextResponse.json({
    epoch: null,
    intents,
    work,
    metrics: {
      total: work.length,
      received: work.filter((item) => item.status === "RECEIVED").length,
      verified: work.filter((item) => item.status === "VERIFIED").length,
      confirmed: work.filter((item) => item.status === "CONFIRMED").length,
    },
    network,
    tinOperations,
    fetched_at: new Date().toISOString(),
  }, {
    headers: { "cache-control": "public, max-age=2, stale-while-revalidate=5" },
  });
}
