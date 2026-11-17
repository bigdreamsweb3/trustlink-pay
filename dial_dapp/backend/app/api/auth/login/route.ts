export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { loginSchema } from "@/app/lib/validation";
import { loginUser } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = loginSchema.parse(body);
    const result = await loginUser(payload);

    return ok({
      authenticated: false,
      challengeToken: result.challengeToken,
      pinRequired: result.pinRequired,
      pinSetupRequired: result.pinSetupRequired,
      user: result.user,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
