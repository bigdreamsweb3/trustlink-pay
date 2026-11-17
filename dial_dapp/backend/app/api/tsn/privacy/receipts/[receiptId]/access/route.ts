export const runtime = "nodejs";

import { z } from "zod";
import { createRequestBodyCommitment } from "@trustlink/tsn-sdk";

import { findEncryptedReceiptForRecipient } from "@/app/db/tsn-privacy/encrypted-receipts";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { authorizePrivateRequest } from "@/app/services/tsn-privacy/private-request-authorization";

const proofSchema = z.object({
  protocolVersion: z.literal("tsn-session-proof-v1"),
  domain: z.literal("TSN_PRIVATE_REQUEST_PROOF"),
  sessionId: z.string().uuid(),
  deviceId: z.string().uuid(),
  deviceSigningKeyFingerprint: z.string(),
  permission: z.literal("private-receipt:read"),
  method: z.literal("POST"),
  resource: z.string(),
  bodyCommitment: z.string(),
  nonce: z.string().min(32),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  audience: z.string().url(),
  signatureBase64Url: z.string().min(64),
});

const requestSchema = z.object({ proof: proofSchema });

function privateSessionToken(request: Request) {
  const value = request.headers.get("x-tsn-private-session");
  if (!value) throw new Error("Private session token is required");
  return value;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ receiptId: string }> },
) {
  try {
    const { receiptId } = await context.params;
    if (!z.string().uuid().safeParse(receiptId).success) {
      return fail("Invalid receipt ID", 400);
    }
    const payload = requestSchema.parse(await request.json());
    const resource = `/api/tsn/privacy/receipts/${receiptId}/access`;
    const bodyCommitment = await createRequestBodyCommitment(
      new TextEncoder().encode(receiptId),
    );
    const { session, device } = await authorizePrivateRequest({
      sessionToken: privateSessionToken(request),
      proof: payload.proof,
      permission: "private-receipt:read",
      method: "POST",
      resource,
      bodyCommitment,
      audience: new URL(request.url).origin,
    });
    const receipt = await findEncryptedReceiptForRecipient({
      receiptId,
      tinCommitment: session.tinCommitment,
      recipientKeyId: device.encryptionKeyFingerprint,
    });
    if (!receipt) {
      return fail(
        "Encrypted receipt is unavailable for this authorized device",
        404,
      );
    }
    return ok(receipt);
  } catch (error) {
    return toErrorResponse(error);
  }
}
