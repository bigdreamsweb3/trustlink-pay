export const runtime = "nodejs";

import { verifyOtpSchema } from "@/app/lib/validation";
import { ok, toErrorResponse } from "@/app/lib/http";
import { verifyPhoneOtp } from "@/app/services/phone-verification";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = verifyOtpSchema.parse(body);

    const result = await verifyPhoneOtp(payload.phoneNumber, payload.otp, {
      consume: false,
      purpose: payload.purpose
    });

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
