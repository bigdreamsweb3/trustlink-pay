export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { ok, toErrorResponse } from "@/app/lib/http";
import { pinChallengeSchema } from "@/app/lib/validation";
import { startUserPinChallenge } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    pinChallengeSchema.parse(body);
    const result = await startUserPinChallenge(authUser);

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
