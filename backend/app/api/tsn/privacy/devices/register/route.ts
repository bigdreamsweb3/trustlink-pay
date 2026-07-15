export const runtime = "nodejs";

import { z } from "zod";

import { ok, toErrorResponse } from "@/app/lib/http";
import { registerOwnerAuthorizedDevice } from "@/app/services/tsn-privacy/device-registration";

const publicJwkSchema = z.object({
  kty: z.string(),
  crv: z.string(),
  x: z.string(),
}).passthrough();

const authorizationSchema = z.object({
  protocolVersion: z.literal("tsn-device-authorization-v1"),
  domain: z.literal("TSN_OWNER_DEVICE_AUTHORIZATION"),
  network: z.string().min(1),
  tinCommitment: z.string().min(32),
  ownerIdentityCommitment: z.string().min(32),
  deviceSigningKeyFingerprint: z.string().min(32),
  deviceEncryptionKeyFingerprint: z.string().min(32),
  permissions: z.array(z.string().min(1)).min(1),
  historyRecoveryScope: z.enum(["all", "recent", "selected", "future-only"]),
  selectedReceiptIds: z.array(z.string()).optional(),
  nonce: z.string().min(32),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  audience: z.string().url(),
});

const ownerVerificationSchema = z.object({
  signerPublicKey: z.string().min(32),
  signatureBase64: z.string().min(64),
});

const requestSchema = z.object({
  tin: z.string().regex(/^\d+$/, "TIN must contain digits only"),
  deviceId: z.string().uuid(),
  signingPublicKey: publicJwkSchema,
  encryptionPublicKey: publicJwkSchema,
  authorization: authorizationSchema,
  ownerVerification: ownerVerificationSchema,
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const result = await registerOwnerAuthorizedDevice({
      tin: payload.tin,
      deviceId: payload.deviceId,
      signingPublicKey: payload.signingPublicKey,
      encryptionPublicKey: payload.encryptionPublicKey,
      authorization: payload.authorization,
      ownerVerification: payload.ownerVerification,
      expectedNetwork: process.env.TSN_NETWORK ?? "devnet",
      expectedAudience: new URL(request.url).origin,
    });
    return ok(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
