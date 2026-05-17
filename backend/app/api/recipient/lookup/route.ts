export const runtime = "nodejs";

import { CACHE_TAGS, CACHE_TTL_SECONDS, cachedQuery } from "@/app/lib/cache";
import { ok, toErrorResponse } from "@/app/lib/http";
import { recipientLookupSchema } from "@/app/lib/validation";
import { lookupRecipientIdentity } from "@/app/services/recipients";

const getCachedRecipientLookup = cachedQuery(
  "recipient-lookup-v1",
  (phoneNumber: string, skipWhatsAppCheck?: boolean) =>
    lookupRecipientIdentity(phoneNumber, {
      skipWhatsAppCheck,
    }),
  {
    revalidate: CACHE_TTL_SECONDS.recipientLookup,
    tags: [CACHE_TAGS.recipients],
  },
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = recipientLookupSchema.parse(body);
    const result = await getCachedRecipientLookup(payload.phoneNumber, payload.skipWhatsAppCheck);

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
