export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { verifyWhatsAppNumberSchema } from "@/app/lib/validation";
import { verifyWhatsAppNumber } from "@/app/services/whatsapp-number-verification";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = verifyWhatsAppNumberSchema.parse(body);
    const result = await verifyWhatsAppNumber(payload.phoneNumber);

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
