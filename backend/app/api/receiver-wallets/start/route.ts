export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { startReceiverWalletVerificationSchema } from "@/app/lib/validation";
import { startAddReceiverWalletOtp } from "@/app/services/auth";

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const body = await request.json().catch(() => ({}));
    startReceiverWalletVerificationSchema.parse(body);
    const result = await startAddReceiverWalletOtp(authUser);

    return ok(result);
  });
}
