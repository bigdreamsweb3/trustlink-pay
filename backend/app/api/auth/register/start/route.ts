export const runtime = "nodejs";

import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { getClientIp } from "@/app/lib/request";
import { startAuthOtpSchema } from "@/app/lib/validation";
import { startRegistrationOtp } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = startAuthOtpSchema.parse(body);
    const result = await startRegistrationOtp(payload.phoneNumber, getClientIp(request));

    return ok({
      sent: true,
      phoneNumber: result.phoneNumber,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Phone number is already registered") {
      return fail(error.message, 409);
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
