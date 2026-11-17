export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { authPhoneStatusSchema } from "@/app/lib/validation";
import { getPhoneFirstAuthStatus } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = authPhoneStatusSchema.parse(body);
    const result = await getPhoneFirstAuthStatus(payload.phoneNumber);

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
