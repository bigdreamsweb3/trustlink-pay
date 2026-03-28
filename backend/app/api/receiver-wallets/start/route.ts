export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { startReceiverWalletVerificationSchema } from "@/app/lib/validation";
import { startAddReceiverWalletOtp } from "@/app/services/auth";

export async function POST(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    startReceiverWalletVerificationSchema.parse(body);
    const result = await startAddReceiverWalletOtp(authUser);

    return ok(result);
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}
