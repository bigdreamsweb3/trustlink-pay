export const runtime = "nodejs";

import { CACHE_TAGS, CACHE_TTL_SECONDS, cachedQuery } from "@/app/lib/cache";
import { ok, toErrorResponse } from "@/app/lib/http";
import { verifyWhatsAppNumberSchema } from "@/app/lib/validation";
import { verifyWhatsAppNumber } from "@/app/services/whatsapp";

const getCachedWhatsAppVerification = cachedQuery(
  "whatsapp-verify-number-v1",
  (phoneNumber: string) => verifyWhatsAppNumber(phoneNumber),
  {
    revalidate: CACHE_TTL_SECONDS.whatsappVerification,
    tags: [CACHE_TAGS.whatsapp],
  },
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = verifyWhatsAppNumberSchema.parse(body);
    const result = await getCachedWhatsAppVerification(payload.phoneNumber);

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
