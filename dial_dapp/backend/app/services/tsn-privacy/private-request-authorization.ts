import type { SignedSessionProof } from "@trustlink/tsn-sdk";
import { verifyTsnAuthorizedPrivateRequest } from "@trustlink/tsn-sdk/sessions/server";

import { findAuthorizedDevice } from "@/app/db/tsn-privacy/authorized-devices";
import {
  consumePrivateRequestNonce,
  findActivePrivateSessionByToken,
} from "@/app/db/tsn-privacy/private-sessions";

export async function authorizePrivateRequest(params: {
  sessionToken: string;
  proof: SignedSessionProof;
  permission: string;
  method: string;
  resource: string;
  bodyCommitment: string;
  audience: string;
}) {
  return verifyTsnAuthorizedPrivateRequest({
    sessionToken: params.sessionToken,
    proof: params.proof,
    permission: params.permission,
    method: params.method,
    resource: params.resource,
    bodyCommitment: params.bodyCommitment,
    expectedAudience: params.audience,
    findSessionByToken: findActivePrivateSessionByToken,
    findDevice: findAuthorizedDevice,
    consumeNonce: consumePrivateRequestNonce,
  });
}
