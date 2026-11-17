export const runtime = "nodejs";

import { sendOtpSchema } from "@/app/lib/validation";
import { ok, toErrorResponse } from "@/app/lib/http";
import { sendPhoneVerificationOtp } from "@/app/services/phone-verification";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = sendOtpSchema.parse(body);

    const result = await sendPhoneVerificationOtp(payload.phoneNumber, payload.purpose);

    return ok(
      {
        sent: true,
        phoneNumber: result.phoneNumber,
        expiresAt: result.expiresAt
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
