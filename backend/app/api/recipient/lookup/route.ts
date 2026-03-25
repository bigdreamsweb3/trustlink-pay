export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { recipientLookupSchema } from "@/app/lib/validation";
import { lookupRecipientIdentity } from "@/app/services/recipients";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = recipientLookupSchema.parse(body);
    const result = await lookupRecipientIdentity(payload.phoneNumber);

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
