import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { assertSafeLitTinActionRequest } from "@trustlink/tsn-sdk/lit-tin-action-contract";
import {
  LIT_TIN_ACTION_REPLAY_MODE,
  LIT_TIN_ACTION_RUNTIME,
  assertLitTinActionConfiguration,
} from "@trustlink/tsn-sdk/lit-tin-action-configuration";

export const runtime = "nodejs";

function configuration() {
  return assertLitTinActionConfiguration({
    runtime: LIT_TIN_ACTION_RUNTIME,
    apiBaseUrl: process.env.LIT_CHIPOTLE_API_BASE_URL,
    actionCid: process.env.LIT_TIN_ACTION_CID,
    actionSourceSha256: process.env.LIT_TIN_ACTION_SOURCE_SHA256,
    pkpId: process.env.LIT_TIN_PKP_ID,
    groupId: process.env.LIT_TIN_GROUP_ID,
    replayProtection: {
      mode: LIT_TIN_ACTION_REPLAY_MODE,
      endpoint: `${process.env.TSN_NODE_PUBLIC_URL?.replace(/\/$/, "")}/threshold-access/nonces/consume`,
      audience: "tsn-tin-threshold-key",
      verifierPublicKey: process.env.TSN_THRESHOLD_NONCE_VERIFIER_PUBLIC_KEY ?? "",
    },
  });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const expected = process.env.TRUSTLINK_PUBLIC_ORIGIN ?? request.nextUrl.origin;
  const left = Buffer.from(origin);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  void request;
  try {
    return NextResponse.json(configuration(), {
      headers: { "cache-control": "no-store, private" },
    });
  } catch {
    return NextResponse.json({ error: "TIN threshold action is not configured" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origin rejected" }, { status: 403 });
  try {
    const config = configuration();
    const body = await request.json() as { request?: unknown; actionCid?: string };
    assertSafeLitTinActionRequest(body.request);
    if (body.actionCid !== config.actionCid) throw new Error("Immutable action CID mismatch");
    const usageKey = process.env.LIT_CHIPOTLE_USAGE_API_KEY;
    if (!usageKey) throw new Error("Lit usage credential is unavailable");
    const endpoint = process.env.LIT_CHIPOTLE_EXECUTE_URL;
    if (!endpoint || !endpoint.startsWith(`${config.apiBaseUrl}/`)) {
      throw new Error("Lit execution endpoint is not pinned to the configured API origin");
    }
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": usageKey },
      body: JSON.stringify({
        ipfs_id: config.actionCid,
        group_id: config.groupId,
        js_params: {
          request: body.request,
          replayEndpoint: config.replayProtection.endpoint,
          verifierPublicKeyBase64Url: config.replayProtection.verifierPublicKey,
        },
      }),
      cache: "no-store",
    });
    const payload = await upstream.json() as { response?: unknown; result?: unknown; error?: unknown };
    if (!upstream.ok) throw new Error(`Lit action execution failed (${upstream.status})`);
    const raw = payload.response ?? payload.result;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object" || "error" in parsed) {
      throw new Error("Lit action returned an invalid response");
    }
    return NextResponse.json({ result: parsed });
  } catch (error) {
    const reference = createHash("sha256").update(
      error instanceof Error ? error.message : "threshold-action-error",
    ).digest("hex").slice(0, 12);
    return NextResponse.json(
      { error: `TIN threshold action failed; reference ${reference}` },
      { status: 502 },
    );
  }
}
