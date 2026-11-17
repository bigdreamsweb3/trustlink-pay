export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { addRecoveryWalletSchema } from "@/app/lib/validation";
import { prepareAddRecoveryWalletForUser } from "@/app/services/identity-binding";

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const body = await request.json();
    const payload = addRecoveryWalletSchema.parse(body);
    const result = await prepareAddRecoveryWalletForUser(authUser, payload);

    return ok(result);
  });
}
