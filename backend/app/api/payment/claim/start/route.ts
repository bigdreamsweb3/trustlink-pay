export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { requireAuthenticatedUser } from "@/app/lib/auth";
import { startClaimSchema } from "@/app/lib/validation";
import { startPaymentClaim } from "@/app/services/payments";

export async function POST(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const body = await request.json();
    const payload = startClaimSchema.parse(body);
    const result = await startPaymentClaim({
      ...payload,
      authUser
    });

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
