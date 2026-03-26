export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { authPhoneVerifySchema } from "@/app/lib/validation";
import { verifyPhoneFirstAuth } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = authPhoneVerifySchema.parse(body);
    const result = await verifyPhoneFirstAuth(payload);

    return ok({
      authenticated: false,
      challengeToken: result.challengeToken,
      pinRequired: result.pinRequired,
      pinSetupRequired: result.pinSetupRequired,
      isNewUser: result.isNewUser,
      user: result.user,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
