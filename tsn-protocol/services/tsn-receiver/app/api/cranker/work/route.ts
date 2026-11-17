import { NextRequest, NextResponse } from "next/server";
import { authenticateCrankerRequest, enforceCrankerLeaseRateLimit } from "../../../../lib/cranker-auth";
import { attachCrankerAuthorization, leaseForCranker, recordSettlementSubmission, retryLeasedSettlementFundingRoot, transition } from "../../../../lib/store";
import { reconcileExpiredCrankerConfirmation } from "../../../../lib/settlement-reconciliation";
import { NATIVE_REVERIFY_REASONS } from "../../../../lib/settlement-retry";
import { requestNodeAuthorization } from "../../../../lib/node-authorizations";
import { crankerAuthorizationForWork, crankerExecutionPayload, verifiedPayloadForWork } from "../../../../lib/work-contract";
export const runtime = "nodejs";

/** Save a signed native settlement identity before its first broadcast. */
export async function PUT(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const owner = await authenticateCrankerRequest(request, bodyText, "PUT", "/api/cranker/work");
    const body = JSON.parse(bodyText) as { id: string; expectedVersion: number; evidence: Record<string, unknown> };
    if (typeof body.id !== "string" || !Number.isSafeInteger(body.expectedVersion)
        || !body.evidence || typeof body.evidence !== "object" || Array.isArray(body.evidence)) {
      return NextResponse.json({ error: "Invalid settlement submission checkpoint" }, { status: 400 });
    }
    return NextResponse.json(await recordSettlementSubmission({ ...body, owner }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: errorStatus(error) });
  }
}

function errorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "ERROR";
  if (message === "UNAUTHORIZED_SERVICE") return 401;
  if (message.includes("CRANKER_SIGNATURE") || message.includes("CRANKER_PUBLIC_KEY") || message.includes("CRANKER_MOTHER") || message.includes("CRANKER_OPERATOR") || message.includes("CRANKER_ACCOUNT") || message.includes("CRANKER_SESSION") || message.includes("CRANKER_REQUEST") || message.includes("CHALLENGE") || message.includes("REQUEST_EXPIRED")) return 401;
  if (message.includes("RATE_LIMITED")) return 429;
  if (/fetch failed|ECONNRESET|network|timeout|temporarily unavailable/i.test(message)) return 503;
  if (message.includes("authorization service is unavailable")) return 503;
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
    if (work && ["SETTLEMENT", "TCAP_EPOCH_ACCOUNTING"].includes(work.kind)) {
      const { configured, response } = await requestNodeAuthorization(
        "/internal/settlement-authorizations/settlement", { workId: work.id, crankerPubkey: operator },
      );
      if (!configured) throw new Error("TSN Node authorization service is not configured");
      if (!response) {
        const native = work.kind !== "SETTLEMENT"
          || work.verification?.verificationType === "TSN_TCAP_GPRU_HIDDEN_HEAD_V1";
        if (!native) throw new Error("TSN Node authorization service is unavailable");
        const requeued = await retryLeasedSettlementFundingRoot({
          id: work.id, expectedVersion: work.stateVersion, owner: operator,
          reason: "TSN_NODE_SIGNING_SERVICE_UNAVAILABLE", requestedBy: "authenticated-node-authorization",
        });
        return NextResponse.json({ work: null, requeued });
      }
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        let rejection: { detail?: unknown } = {};
        try { rejection = JSON.parse(detail) as { detail?: unknown }; } catch { /* Unstructured failures remain errors. */ }
        if (response.status === 409 && typeof rejection.detail === "string" && NATIVE_REVERIFY_REASONS.has(rejection.detail)) {
          const requeued = await retryLeasedSettlementFundingRoot({
            id: work.id, expectedVersion: work.stateVersion, owner: operator, reason: String(rejection.detail), requestedBy: "authenticated-node-authorization",
          });
          return NextResponse.json({ work: null, requeued });
        }
        return new NextResponse(detail, { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
      }
      const authorization = crankerAuthorizationForWork(work, await response.json() as Record<string, unknown>);
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
    try {
      return NextResponse.json(await transition({ ...body, owner: operator, actor: "cranker" }));
    } catch (error) {
      const code = error instanceof Error ? error.message : "ERROR";
      if ((code === "LEASE_INVALID" || code === "STALE_STATE_VERSION") && body.status === "CONFIRMED"
          && typeof body.evidence?.signature === "string" && /^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(body.evidence.signature)) {
        return NextResponse.json(await reconcileExpiredCrankerConfirmation({
          id: body.id, owner: operator, expectedVersion: body.expectedVersion, signature: body.evidence.signature,
        }));
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: errorStatus(error) });
  }
}
