export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { pinSetupSchema } from "@/app/lib/validation";
import { setupUserPin } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = pinSetupSchema.parse(body);
    const result = await setupUserPin(payload);

    return ok({
      accessGranted: true,
      accessToken: result.accessToken,
      user: result.user
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
