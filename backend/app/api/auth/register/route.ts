export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { registerSchema } from "@/app/lib/validation";
import { registerUser } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = registerSchema.parse(body);
    const result = await registerUser(payload);

    return ok(
      {
        registered: true,
        challengeToken: result.challengeToken,
        pinSetupRequired: true,
        user: result.user
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
