export const runtime = "nodejs";

import { z } from "zod";
import { verifyTsnPrivateSessionCreation } from "@trustlink/tsn-sdk/sessions/server";

import { findAuthorizedDevice } from "@/app/db/tsn-privacy/authorized-devices";
import {
  consumePrivateRequestNonce,
  createPrivateSessionRecord,
} from "@/app/db/tsn-privacy/private-sessions";
import { ok, toErrorResponse } from "@/app/lib/http";

const proofSchema = z.object({
  protocolVersion: z.literal("tsn-session-proof-v1"),
  domain: z.literal("TSN_PRIVATE_REQUEST_PROOF"),
  sessionId: z.string().uuid(),
  deviceId: z.string().uuid(),
  deviceSigningKeyFingerprint: z.string(),
  permission: z.literal("private-session:create"),
  method: z.literal("POST"),
  resource: z.literal("/api/tsn/privacy/sessions"),
  bodyCommitment: z.string(),
  nonce: z.string().min(32),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  audience: z.string().url(),
  signatureBase64Url: z.string().min(64),
});

const requestSchema = z.object({
  sessionId: z.string().uuid(),
  deviceId: z.string().uuid(),
  sessionToken: z.string().min(32),
  permissions: z.array(z.string().min(1)).min(1),
  audience: z.string().url(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  proof: proofSchema,
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const device = await findAuthorizedDevice(payload.deviceId);
    if (!device) throw new Error("Authorized device was not found");
    const sessionRequest = {
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
      sessionToken: payload.sessionToken,
      permissions: payload.permissions,
      audience: payload.audience,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
    };
    const verification = await verifyTsnPrivateSessionCreation({
      request: sessionRequest,
      proof: payload.proof,
      device,
      expectedAudience: new URL(request.url).origin,
      expectedResource: "/api/tsn/privacy/sessions",
      consumeNonce: consumePrivateRequestNonce,
    });
    await createPrivateSessionRecord({
      ...sessionRequest,
      tinCommitment: device.tinCommitment,
      permissions: verification.permissions,
      origin: request.headers.get("origin") ?? undefined,
    });
    return ok(
      {
        sessionId: payload.sessionId,
        state: "authorized",
        expiresAt: payload.expiresAt,
      },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
