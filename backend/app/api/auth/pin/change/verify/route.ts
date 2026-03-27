export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { pinChangeVerifySchema } from "@/app/lib/validation";
import { changeUserPinWithOtp } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const body = await request.json();
    const payload = pinChangeVerifySchema.parse(body);
    const result = await changeUserPinWithOtp(authUser, payload);

    return ok({
      pinChanged: true,
      user: result.user,
    });
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}
