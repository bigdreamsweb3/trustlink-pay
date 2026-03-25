export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { updateProfileSchema } from "@/app/lib/validation";
import { updateProfileForUser } from "@/app/services/auth";

export async function PATCH(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const body = await request.json();
    const payload = updateProfileSchema.parse(body);
    const user = await updateProfileForUser(authUser, payload);

    return ok({
      user
    });
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}
