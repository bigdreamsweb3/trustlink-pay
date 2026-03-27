export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { getClientIp } from "@/app/lib/request";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { pinChangeStartSchema } from "@/app/lib/validation";
import { startPinChangeOtp } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    pinChangeStartSchema.parse(body);
    const result = await startPinChangeOtp(authUser, getClientIp(request));

    return ok({
      otpSent: true,
      phoneNumber: result.phoneNumber,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}
