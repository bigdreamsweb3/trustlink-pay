import { NextRequest, NextResponse } from "next/server";
import { authenticateCrankerRequest, enforceCrankerLeaseRateLimit } from "../../../../lib/cranker-auth";
import { attachCrankerAuthorization, leaseForCranker, transition } from "../../../../lib/store";
import { crankerExecutionPayload, verifiedPayloadForWork } from "../../../../lib/work-contract";
export const runtime = "nodejs";

function cleanUrl(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, "");
}

function errorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "ERROR";
  if (message === "UNAUTHORIZED_SERVICE") return 401;
  if (message.includes("CRANKER_SIGNATURE") || message.includes("CRANKER_PUBLIC_KEY") || message.includes("CRANKER_MOTHER") || message.includes("CRANKER_OPERATOR") || message.includes("CRANKER_ACCOUNT") || message.includes("CRANKER_SESSION") || message.includes("CRANKER_REQUEST") || message.includes("CHALLENGE") || message.includes("REQUEST_EXPIRED")) return 401;
  if (message.includes("RATE_LIMITED")) return 429;
  if (/fetch failed|ECONNRESET|network|timeout|temporarily unavailable/i.test(message)) return 503;
  if (message.includes("authorization service is unavailable")) return 503;
  if (message.includes("TSN Node authorization failed")) return 502;
  return 409;
}

function crankerWorkView(work: Awaited<ReturnType<typeof leaseForCranker>>) {
  if (!work) return null;
  const verifiedPayload = verifiedPayloadForWork(work);
  // Funding work exposes only the already sender-signed transaction envelope
  // required for sponsorship. It never exposes the private Node payload,
  // recipient TIN, route map, commitment plaintext, or payment record fields.
  const executionPayload = verifiedPayload ? crankerExecutionPayload(work.kind, verifiedPayload) : undefined;
  return {
    id: work.id, kind: work.kind, status: work.status, stateVersion: work.stateVersion,
    payloadCommitment: work.payloadCommitment,
    payload: {},
    receivedAt: work.receivedAt, updatedAt: work.updatedAt, crankerLease: work.crankerLease ?? null,
    verification: work.verification ? {
      verificationType: work.verification.verificationType ?? null,
      nodeAttestation: work.verification.nodeAttestation ?? null,
      ...(executionPayload && Object.keys(executionPayload).length ? { verifiedPayload: executionPayload } : {}),
    } : null,
    authorization: work.authorization ?? null,
    result: work.result ?? null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const operator = await authenticateCrankerRequest(request, bodyText, "POST", "/api/cranker/work");
    await enforceCrankerLeaseRateLimit(operator);
    const body = JSON.parse(bodyText) as { supportedKinds?: Parameters<typeof leaseForCranker>[1] };
    let work = await leaseForCranker(operator, body.supportedKinds);
    if (work && work.kind === "SETTLEMENT") {
      const nodeUrls = [process.env.TSN_NODE_URL, process.env.TSN_NODE_FALLBACK_URL]
        .filter((value): value is string => Boolean(value?.trim()))
        .map(cleanUrl);
      const nodeKey = process.env.TSN_RECEIVER_NODE_API_KEY;
      if (!nodeKey || nodeUrls.length === 0) throw new Error("TSN Node authorization service is not configured");
      let response: Response | undefined;
      let lastNodeError = "";
      for (const nodeUrl of [...new Set(nodeUrls)]) {
        try {
          response = await fetch(`${nodeUrl}/internal/settlement-authorizations/settlement`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": nodeKey },
            body: JSON.stringify({ workId: work.id, crankerPubkey: operator }),
          });
          if (response.ok) break;
          // A 404 means this process is not serving the current Node API. It
          // is an availability failure for this route, so try an explicitly
          // configured fallback. Other 4xx responses are protocol failures
          // and must be returned without trying another Node.
          if (response.status !== 404 && response.status < 500) break;
          lastNodeError = `${nodeUrl} returned ${response.status}`;
          response = undefined;
        } catch (error) {
          // A dead primary Node must not strand a leased settlement when a
          // configured fallback is available. Continue to the next URL.
          lastNodeError = `${nodeUrl}: ${error instanceof Error ? error.message : "fetch failed"}`;
          response = undefined;
        }
      }
      if (!response) throw new Error(`TSN Node authorization service is unavailable (${lastNodeError || "fetch failed"})`);
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`TSN Node authorization failed (${response.status}): ${detail}`);
      }
      const authorization = await response.json() as Record<string, unknown>;
      work = await attachCrankerAuthorization({ id: work.id, owner: operator, expectedVersion: work.stateVersion, authorization });
    }
    // The ingress payload may contain private routing identifiers required by
    // the Node. Crankers receive only the Node-verified, privacy-minimized view.
    return NextResponse.json({ work: crankerWorkView(work) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: errorStatus(error) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const operator = await authenticateCrankerRequest(request, bodyText, "PATCH", "/api/cranker/work");
    const body = JSON.parse(bodyText) as Parameters<typeof transition>[0];
    return NextResponse.json(await transition({ ...body, owner: operator, actor: "cranker" }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: errorStatus(error) });
  }
}
