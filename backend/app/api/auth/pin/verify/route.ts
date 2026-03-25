export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { pinVerifySchema } from "@/app/lib/validation";
import { verifyUserPin } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = pinVerifySchema.parse(body);
    const result = await verifyUserPin(payload);

    return ok({
      accessGranted: true,
      accessToken: result.accessToken,
      user: result.user
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
