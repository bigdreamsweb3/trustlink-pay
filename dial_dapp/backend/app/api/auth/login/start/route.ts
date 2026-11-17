export const runtime = "nodejs";

import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { getClientIp } from "@/app/lib/request";
import { startAuthOtpSchema } from "@/app/lib/validation";
import { startLoginOtp } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = startAuthOtpSchema.parse(body);
    const result = await startLoginOtp(payload.phoneNumber, getClientIp(request));

    return ok({
      sent: true,
      phoneNumber: result.phoneNumber,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Account not found") {
      return fail(error.message, 404);
    }

    if (
      error instanceof Error &&
      (error.message.includes("Too many OTP requests") || error.message.includes("Too many OTP requests from this network"))
    ) {
      return fail(error.message, 429);
    }

    return toErrorResponse(error);
  }
}
