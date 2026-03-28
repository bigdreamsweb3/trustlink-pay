export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { getClientIp } from "@/app/lib/request";
import { startAuthOtpSchema } from "@/app/lib/validation";
import { startPhoneFirstAuth } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = startAuthOtpSchema.parse(body);
    const result = await startPhoneFirstAuth(payload.phoneNumber, getClientIp(request), {
      skipWhatsAppCheck: payload.skipWhatsAppCheck,
    });

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
